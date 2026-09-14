import { actionForTool, labelForTool } from "../../src/core/mapping.ts";
import type { AgentState, AgentView, LogItem, OfficeDelta, OfficeEvent, RecordedOfficeEvent, SessionInfo } from "../../src/core/protocol.ts";
import { SCENE_LIMITS } from "../../src/core/limits.ts";

export interface DshMessageRecord {
	key: string;
	kind: "user" | "assistant" | "turn-error";
	text?: string;
	at: number;
	tokens?: number;
}

export interface DshToolRecord {
	callId: string;
	name: string;
	args: Record<string, unknown>;
	at: number;
	running: boolean;
	ok?: boolean;
}

export interface DshChildRecord {
	id: string;
	name: string;
	task?: string;
	running: boolean;
}

export interface DshObservation {
	sessionId: string;
	running: boolean;
	turns: number;
	model?: string;
	thinkingLevel?: string;
	tokens?: number;
	messages: readonly DshMessageRecord[];
	tools: readonly DshToolRecord[];
	children: readonly DshChildRecord[];
}

const short = (value: string, max: number) => {
	const clean = value.replace(/\s+/g, " ").trim();
	return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};
const OBSERVATION_WINDOW = 4000;

function sessionOf(input: DshObservation, startedAt: number): SessionInfo {
	return {
		cwd: "",
		...(input.model ? { model: input.model } : {}),
		...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
		busy: input.running,
		turns: Math.max(0, Math.trunc(input.turns)),
		startedAt,
	};
}

function mainAgent(input: DshObservation, startedAt: number): AgentView {
	const lastTask = [...input.messages].reverse().find((item) => item.kind === "user")?.text;
	const activeTool = input.tools.find((tool) => tool.running);
	const hasError = input.messages.at(-1)?.kind === "turn-error";
	const state: AgentState = hasError ? "error" : activeTool ? "working" : input.running ? "thinking" : "idle";
	return {
		id: `dsh:${input.sessionId}`,
		name: "DeepSeek",
		role: "Main Agent",
		state,
		...(lastTask ? { task: short(lastTask, 300) } : {}),
		...(activeTool ? {
			action: actionForTool(activeTool.name),
			detail: labelForTool(activeTool.name, activeTool.args),
		} : {}),
		...(input.model ? { model: input.model } : {}),
		tokens: Math.max(0, input.tokens ?? 0, ...input.messages.map((item) => item.tokens ?? 0)),
		cost: 0,
		toolCalls: input.tools.length,
		joinedAt: startedAt,
		seat: 0,
	};
}

function recoveredHistory(input: DshObservation, mainId: string): RecordedOfficeEvent[] {
	const recovered: Array<RecordedOfficeEvent & { order: number }> = [];
	let order = 0;
	const record = (at: number, event: OfficeDelta) => recovered.push({ at, event, order: order++ });
	for (const message of input.messages.slice(-OBSERVATION_WINDOW)) {
		const text = short(message.text ?? "", message.kind === "user" ? 300 : 400);
		if (message.kind === "user" && text) record(message.at, { type: "task", id: mainId, task: text });
		if (message.kind === "assistant" && text) record(message.at, { type: "say", id: mainId, text });
	}
	for (const tool of input.tools.slice(-OBSERVATION_WINDOW)) {
		record(tool.at, {
			type: "action",
			id: mainId,
			action: actionForTool(tool.name),
			label: labelForTool(tool.name, tool.args),
			toolCallId: tool.callId,
		});
		if (!tool.running) record(tool.at + 1, { type: "action_end", id: mainId, toolCallId: tool.callId, ok: tool.ok !== false });
	}
	return recovered
		.sort((left, right) => left.at - right.at || left.order - right.order)
		.slice(-OBSERVATION_WINDOW)
		.map(({ at, event }) => ({ at, event }));
}

/** Stateful diff cursor over DSH's already-deduplicated public client snapshots. */
export class DshSnapshotAdapter {
	private static readonly SEEN_LIMIT = OBSERVATION_WINDOW;
	private readonly startedAt: number;
	private initialized = false;
	private previousSession = "";
	private previousSessionView = "";
	private previousState: AgentState = "idle";
	private previousTokens = 0;
	private readonly seenMessages = new Set<string>();
	private readonly seenTools = new Set<string>();
	private readonly activeTools = new Set<string>();
	private readonly visibleChildren = new Set<string>();

	constructor(now = Date.now()) {
		this.startedAt = now;
	}

	update(input: DshObservation): OfficeEvent[] {
		if (!this.initialized || this.previousSession !== input.sessionId) return [this.bootstrap(input)];
		const output: OfficeEvent[] = [];
		const mainId = `dsh:${input.sessionId}`;
		const session = sessionOf(input, this.startedAt);
		const sessionView = JSON.stringify(session);
		if (sessionView !== this.previousSessionView) {
			output.push({ type: "session", session });
			this.previousSessionView = sessionView;
		}

		this.syncChildren(input, mainId, output);
		for (const tool of input.tools.slice(-DshSnapshotAdapter.SEEN_LIMIT)) {
			if (tool.running && !this.activeTools.has(tool.callId)) {
				this.seenTools.add(tool.callId);
				this.trimSeen(this.seenTools);
				this.activeTools.add(tool.callId);
				output.push({
					type: "action",
					id: mainId,
					action: actionForTool(tool.name),
					label: labelForTool(tool.name, tool.args),
					toolCallId: tool.callId,
				});
			} else if (!tool.running) {
				let emittedStart = false;
				if (!this.seenTools.has(tool.callId)) {
					this.seenTools.add(tool.callId);
					this.trimSeen(this.seenTools);
					output.push({ type: "action", id: mainId, action: actionForTool(tool.name), label: labelForTool(tool.name, tool.args), toolCallId: tool.callId });
					emittedStart = true;
				}
				if (this.activeTools.delete(tool.callId) || emittedStart) {
					output.push({ type: "action_end", id: mainId, toolCallId: tool.callId, ok: tool.ok !== false });
				}
			}
		}

		for (const message of input.messages.slice(-DshSnapshotAdapter.SEEN_LIMIT)) {
			if (this.seenMessages.has(message.key)) continue;
			this.seenMessages.add(message.key);
			this.trimSeen(this.seenMessages);
			const text = short(message.text ?? "", message.kind === "user" ? 300 : 400);
			if (message.kind === "user" && text) output.push({ type: "task", id: mainId, task: text });
			if (message.kind === "assistant" && text) output.push({ type: "say", id: mainId, text });
		}
		const tokens = Math.max(0, input.tokens ?? 0, ...input.messages.map((item) => item.tokens ?? 0));
		if (tokens !== this.previousTokens) {
			output.push({ type: "usage", id: mainId, tokens, cost: 0 });
			this.previousTokens = tokens;
		}

		const state = mainAgent(input, this.startedAt).state;
		if (state !== this.previousState) {
			output.push({
				type: "agent_state",
				id: mainId,
				state,
				detail: state === "idle" ? "Ready" : state === "working" ? "Using a tool" : state === "error" ? "Task failed" : "Thinking",
			});
			this.previousState = state;
		}
		return output;
	}

	private trimSeen(values: Set<string>): void {
		while (values.size > DshSnapshotAdapter.SEEN_LIMIT) values.delete(values.values().next().value!);
	}

	private bootstrap(input: DshObservation): OfficeEvent {
		this.initialized = true;
		this.previousSession = input.sessionId;
		this.previousSessionView = JSON.stringify(sessionOf(input, this.startedAt));
		this.seenMessages.clear();
		this.seenTools.clear();
		this.activeTools.clear();
		this.visibleChildren.clear();
		// Process and remember the same bounded projection window. Evicting keys
		// while scanning the full log would replay all old events on each update.
		for (const item of input.messages.slice(-DshSnapshotAdapter.SEEN_LIMIT)) this.seenMessages.add(item.key);
		for (const tool of input.tools.slice(-DshSnapshotAdapter.SEEN_LIMIT)) {
			this.seenTools.add(tool.callId);
			if (tool.running) this.activeTools.add(tool.callId);
		}

		const main = mainAgent(input, this.startedAt);
		this.previousTokens = main.tokens;
		this.previousState = main.state;
		const agents = [main];
		for (const [index, child] of input.children.filter((child) => child.running).slice(0, SCENE_LIMITS.agents - 1).entries()) {
			this.visibleChildren.add(child.id);
			agents.push(this.childView(child, main.id, index + 1));
		}
		const log: LogItem[] = input.messages.slice(-30).flatMap((item) => {
			const text = short(item.text ?? "", 400);
			if (!text) return [];
			return [{
				at: item.at,
				agentId: main.id,
				kind: item.kind === "user" ? "system" : item.kind === "assistant" ? "say" : "system",
				text,
			} satisfies LogItem];
		});
		return { type: "snapshot", agents, log, session: sessionOf(input, this.startedAt), history: recoveredHistory(input, main.id) };
	}

	private syncChildren(input: DshObservation, mainId: string, output: OfficeEvent[]): void {
		const current = new Set<string>();
		for (const [index, child] of input.children.filter((child) => child.running).slice(0, SCENE_LIMITS.agents - 1).entries()) {
			current.add(child.id);
			if (this.visibleChildren.has(child.id)) continue;
			this.visibleChildren.add(child.id);
			output.push({ type: "agent_join", agent: this.childView(child, mainId, index + 1) });
			output.push({ type: "delegate", from: mainId, to: child.id, task: child.task ?? child.name });
		}
		for (const id of [...this.visibleChildren]) {
			if (current.has(id)) continue;
			this.visibleChildren.delete(id);
			// DSH's public activity catalog reports that a child stopped, but not
			// whether it succeeded. Preserve that uncertainty in the core event.
			output.push({ type: "agent_leave", id });
		}
	}

	private childView(child: DshChildRecord, parent: string, seat: number): AgentView {
		return {
			id: child.id,
			name: child.name || "Teammate",
			role: "Subagent",
			parent,
			state: "working",
			...(child.task ? { task: child.task } : {}),
			tokens: 0,
			cost: 0,
			toolCalls: 0,
			joinedAt: this.startedAt,
			...(seat < 8 ? { seat } : {}),
		};
	}
}
