import type { AgentState, AgentView, OfficeAction } from "./protocol.ts";
import type { OfficeState } from "./state.ts";

const DEFAULT_LEAVE_DELAY_MS = 2600;

const ROLE_NAMES: Record<string, string> = {
	scout: "侦察员",
	planner: "规划师",
	reviewer: "评审员",
	worker: "工程师",
	tester: "测试员",
	writer: "文案",
};

export function roleForAgent(name: string, fallback = "外援"): string {
	return ROLE_NAMES[name.trim().toLowerCase()] ?? fallback;
}

/**
 * Host-neutral registry and lifecycle for both main agents and subagents.
 * Adapters translate host payloads; this class owns office semantics.
 */
export class AgentRegistry {
	private readonly state: OfficeState;
	private readonly mainId: string;
	private readonly leaveDelayMs: number;
	private readonly children = new Set<string>();
	private readonly completed = new Set<string>();
	private readonly leaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(state: OfficeState, options: { mainId?: string; leaveDelayMs?: number } = {}) {
		this.state = state;
		this.mainId = options.mainId ?? "main";
		this.leaveDelayMs = options.leaveDelayMs ?? DEFAULT_LEAVE_DELAY_MS;
	}

	join(id: string, init: { name: string; role: string; parent?: string; model?: string; task?: string }): AgentView | undefined {
		return this.state.join(id, init);
	}

	spawn(input: { id: string; name: string; task: string; role?: string; parent?: string }): AgentView | undefined {
		const parent = input.parent ?? this.mainId;
		const existing = this.state.getAgent(input.id);
		const agent = this.state.join(input.id, {
			name: input.name,
			role: input.role ?? roleForAgent(input.name),
			parent,
			task: input.task,
		});
		if (!agent) return undefined;
		this.children.add(input.id);
		this.completed.delete(input.id);
		if (!existing) this.state.delegate(parent, input.id, input.task);
		this.state.setState(input.id, "thinking", "接到协作任务");
		this.syncParentState();
		return agent;
	}

	updateIdentity(id: string, patch: { name: string; role?: string; task?: string }): void {
		const current = this.state.getAgent(id);
		if (!current) return;
		this.state.join(id, {
			name: patch.name,
			role: patch.role ?? roleForAgent(patch.name, current.role),
			parent: current.parent,
			model: current.model,
			task: patch.task ?? current.task,
		});
	}

	setState(id: string, state: AgentState, detail?: string): void {
		this.state.setState(id, state, detail);
	}

	setTask(id: string, task: string): void {
		this.state.setTask(id, task);
	}

	thought(id: string, text: string): void {
		this.state.pushThought(id, text);
	}

	say(id: string, text: string): void {
		this.state.say(id, text);
	}

	startAction(id: string, toolCallId: string, action: OfficeAction, label: string): void {
		this.state.startAction(id, toolCallId, action, label);
	}

	endAction(id: string, toolCallId: string, ok: boolean): void {
		this.state.endAction(id, toolCallId, ok);
	}

	usage(id: string, tokens: number, cost: number): void {
		this.state.addUsage(id, tokens, cost);
	}

	complete(id: string, ok: boolean, detail = ok ? "已交付" : "未完成"): void {
		if (!this.state.getAgent(id) || this.leaveTimers.has(id)) return;
		this.completed.add(id);
		this.state.setState(id, ok ? "done" : "error", detail);
		this.syncParentState();
		const timer = setTimeout(() => {
			this.leaveTimers.delete(id);
			this.children.delete(id);
			this.completed.delete(id);
			this.state.leave(id, ok);
			this.syncParentState();
		}, this.leaveDelayMs);
		timer.unref?.();
		this.leaveTimers.set(id, timer);
	}

	settleChildren(ok: boolean): void {
		for (const id of this.children) this.complete(id, ok);
	}

	has(id: string): boolean {
		return this.children.has(id);
	}

	activeChildren(): number {
		let count = 0;
		for (const id of this.children) if (!this.completed.has(id)) count += 1;
		return count;
	}

	dispose(): void {
		for (const timer of this.leaveTimers.values()) clearTimeout(timer);
		this.leaveTimers.clear();
		this.children.clear();
		this.completed.clear();
	}

	private syncParentState(): void {
		const count = this.activeChildren();
		if (count > 0) {
			this.state.setState(this.mainId, "waiting", `等待 ${count} 位同事`);
		} else if (this.state.snapshot().session.busy) {
			this.state.setState(this.mainId, "thinking", "继续推进");
		}
	}
}
