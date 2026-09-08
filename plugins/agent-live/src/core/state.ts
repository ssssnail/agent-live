import type {
	AgentState,
	AgentView,
	LogItem,
	OfficeAction,
	OfficeDelta,
	OfficeEvent,
	RecordedOfficeEvent,
	SessionInfo,
} from "./protocol.ts";

const MAX_LOG = 200;
const MAX_HISTORY = 4000;
const THOUGHT_FLUSH_MS = 180;
/** Avoid emitting one-character bubbles at the start of a reasoning stream. */
const MIN_THOUGHT_CHARS = 12;
const MAX_SEATS = 8;

type Listener = (event: OfficeEvent) => void;

/**
 * Single source of truth for the office. Holds one character per agent, keeps a
 * rolling activity log, and pushes deltas to every connected renderer.
 */
export class OfficeState {
	private agents = new Map<string, AgentView>();
	private log: LogItem[] = [];
	private history: RecordedOfficeEvent[] = [];
	private listeners = new Set<Listener>();
	private session: SessionInfo;
	private thoughtBuffers = new Map<string, string>();
	private thoughtTimer: ReturnType<typeof setTimeout> | undefined;
	private seats = new Set<number>();

	constructor(cwd: string) {
		this.session = {
			cwd,
			busy: false,
			turns: 0,
			startedAt: Date.now(),
		};
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private emit(event: OfficeDelta): void {
		this.history.push({ at: Date.now(), event });
		if (this.history.length > MAX_HISTORY) this.history.shift();
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				// A dead renderer must never break the agent loop.
			}
		}
	}

	snapshot(): OfficeEvent {
		return {
			type: "snapshot",
			agents: [...this.agents.values()],
			log: this.log.slice(-60),
			session: this.session,
			history: this.history.slice(),
		};
	}

	getAgent(id: string): AgentView | undefined {
		return this.agents.get(id);
	}

	hasClients(): boolean {
		return this.listeners.size > 0;
	}

	updateSession(patch: Partial<SessionInfo>): void {
		this.session = { ...this.session, ...patch };
		this.emit({ type: "session", session: this.session });
	}

	private claimSeat(): number {
		for (let i = 0; i < MAX_SEATS; i++) {
			if (!this.seats.has(i)) {
				this.seats.add(i);
				return i;
			}
		}
		return MAX_SEATS - 1;
	}

	join(
		id: string,
		init: { name: string; role: string; parent?: string; model?: string; task?: string },
	): AgentView {
		const existing = this.agents.get(id);
		if (existing) {
			Object.assign(existing, init);
			this.emit({ type: "agent_join", agent: existing });
			return existing;
		}
		const agent: AgentView = {
			id,
			state: "idle",
			tokens: 0,
			cost: 0,
			toolCalls: 0,
			joinedAt: Date.now(),
			seat: this.claimSeat(),
			...init,
		};
		this.agents.set(id, agent);
		this.emit({ type: "agent_join", agent });
		this.addLog(id, "join", `${agent.name} 上班了`);
		return agent;
	}

	leave(id: string, ok: boolean): void {
		const agent = this.agents.get(id);
		if (!agent) return;
		if (agent.seat !== undefined) this.seats.delete(agent.seat);
		this.agents.delete(id);
		this.emit({ type: "agent_leave", id, ok });
		this.addLog(id, "leave", `${agent.name} ${ok ? "交付完成，下班" : "异常退出"}`);
	}

	setState(id: string, state: AgentState, detail?: string): void {
		const agent = this.agents.get(id);
		if (!agent) return;
		agent.state = state;
		agent.detail = detail;
		this.emit({ type: "agent_state", id, state, detail });
	}

	setTask(id: string, task: string): void {
		const agent = this.agents.get(id);
		if (!agent) return;
		agent.task = task;
		this.emit({ type: "task", id, task });
	}

	/** Thinking tokens arrive fast; batch them so the renderer gets readable chunks. */
	pushThought(id: string, delta: string): void {
		if (!delta) return;
		this.thoughtBuffers.set(id, (this.thoughtBuffers.get(id) ?? "") + delta);
		if (this.thoughtTimer) return;
		this.thoughtTimer = setTimeout(() => {
			this.thoughtTimer = undefined;
			this.flushThoughts(false);
		}, THOUGHT_FLUSH_MS);
		if (typeof this.thoughtTimer.unref === "function") this.thoughtTimer.unref();
	}

	flushThoughts(force = true): void {
		for (const [id, text] of this.thoughtBuffers) {
			const clean = text.replace(/\s+/g, " ").trim();
			if (!force && clean.length < MIN_THOUGHT_CHARS) continue;
			this.thoughtBuffers.delete(id);
			if (!clean) continue;
			const agent = this.agents.get(id);
			if (agent) agent.thought = clean.slice(-160);
			this.emit({ type: "thought", id, text: clean });
			this.addLog(id, "thought", clean, false);
		}
	}

	say(id: string, text: string): void {
		const clean = text.replace(/\s+/g, " ").trim();
		if (!clean) return;
		this.emit({ type: "say", id, text: clean.slice(0, 400) });
		this.addLog(id, "say", clean.slice(0, 400), false);
	}

	startAction(
		id: string,
		toolCallId: string,
		action: OfficeAction,
		label: string,
	): void {
		const agent = this.agents.get(id);
		if (agent) {
			agent.action = action;
			agent.toolCalls += 1;
			agent.state = "working";
			agent.detail = label;
		}
		this.emit({ type: "action", id, action, label, toolCallId });
		this.addLog(id, "tool", label, false);
	}

	endAction(id: string, toolCallId: string, ok: boolean): void {
		const agent = this.agents.get(id);
		if (agent) agent.action = undefined;
		this.emit({ type: "action_end", id, toolCallId, ok });
	}

	delegate(from: string, to: string, task: string): void {
		this.emit({ type: "delegate", from, to, task });
		const fromName = this.agents.get(from)?.name ?? from;
		const toName = this.agents.get(to)?.name ?? to;
		this.addLog(from, "delegate", `${fromName} → ${toName}: ${task.slice(0, 120)}`);
	}

	addUsage(id: string, tokens: number, cost: number): void {
		const agent = this.agents.get(id);
		if (!agent) return;
		agent.tokens = tokens || agent.tokens;
		agent.cost = cost || agent.cost;
		this.emit({ type: "usage", id, tokens: agent.tokens, cost: agent.cost });
	}

	addLog(
		agentId: string,
		kind: LogItem["kind"],
		text: string,
		broadcast = true,
	): void {
		const item: LogItem = { at: Date.now(), agentId, kind, text };
		this.log.push(item);
		if (this.log.length > MAX_LOG) this.log.shift();
		if (broadcast) this.emit({ type: "log", item });
	}

	dispose(): void {
		if (this.thoughtTimer) clearTimeout(this.thoughtTimer);
		this.thoughtTimer = undefined;
		this.thoughtBuffers.clear();
		this.listeners.clear();
		this.agents.clear();
		this.seats.clear();
		this.log = [];
		this.history = [];
	}
}
