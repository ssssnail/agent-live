import { actionForTool, labelForTool } from "../../core/mapping.ts";
import type { OfficeAction } from "../../core/protocol.ts";
import type { OfficeState } from "../../core/state.ts";
import { CodexAppServerClient, type AppServerMessage, type JsonObject } from "./app-server-client.ts";
import type { AdapterDescriptor } from "../contract.ts";

export const CODEX_ADAPTER: AdapterDescriptor = {
	id: "codex",
	name: "Codex",
	capabilities: { observe: true, prompt: true, interrupt: true, modelSelect: false, approvals: true, subagents: true },
};

const MAIN = "main";

export interface PendingApproval {
	id: number | string;
	method: string;
	title: string;
	detail: string;
}

export interface CodexModelOption {
	id: string;
	name: string;
	description: string;
	isDefault: boolean;
	defaultReasoningEffort?: string;
}

type Item = JsonObject & { id?: string; type?: string; status?: string; text?: string };
type ActiveAction = { agentId: string };
type ReceiverAgent = { threadId?: string; thread_id?: string; agentNickname?: string; agent_nickname?: string };

/** Owns one Codex thread and translates its live App Server stream to OfficeState. */
export class CodexOfficeSession {
	private readonly state: OfficeState;
	private readonly client: CodexAppServerClient;
	private readonly options: {
		cwd: string;
		sourceThreadId?: string;
		onApproval?: (approval: PendingApproval) => void;
	};
	private threadId = "";
	private turnId = "";
	private startingTurn = false;
	private turns = 0;
	private readonly activeActions = new Map<string, ActiveAction>();
	private readonly childAgents = new Map<string, string>();
	private readonly childLeaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private readonly approvals = new Map<number | string, AppServerMessage>();
	private unsubscribe: (() => void) | null = null;
	private models: CodexModelOption[] = [];
	private model = "";
	private effort = "";
	private interrupting = false;

	constructor(state: OfficeState, client: CodexAppServerClient, options: {
			cwd: string;
			sourceThreadId?: string;
			onApproval?: (approval: PendingApproval) => void;
		}) {
		this.state = state;
		this.client = client;
		this.options = options;
	}

	async start(): Promise<{ threadId: string; model: string; models: CodexModelOption[] }> {
		this.unsubscribe = this.client.onMessage((message) => this.handleMessage(message));
		await this.client.start();
		this.models = await this.listModels();
		const inherited = await this.readSourceConfiguration();
		const fallback = this.models.find((item) => item.isDefault) ?? this.models[0];
		this.model = inherited.model || fallback?.id || "";
		this.effort = inherited.effort || fallback?.defaultReasoningEffort || "";
		const startParams: JsonObject = {
			cwd: this.options.cwd,
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			serviceName: "Agent Live",
		};
		if (this.model) startParams.model = this.model;
		const result = await this.client.request("thread/start", startParams);
		const response = result as { thread?: { id?: string; model?: string; reasoningEffort?: string }; model?: string };
		if (!response.thread?.id) throw new Error("Codex did not return a thread id");
		this.threadId = response.thread.id;
		const model = response.thread.model ?? response.model ?? this.model ?? "codex";
		this.model = model;
		this.effort = response.thread.reasoningEffort ?? this.effort;
		this.state.updateSession({ cwd: this.options.cwd, model, thinkingLevel: this.effort || undefined, busy: false });
		this.state.join(MAIN, { name: "科迪", role: model, model });
		return { threadId: this.threadId, model, models: this.models };
	}

	getStatus(): { threadId: string; model: string; models: CodexModelOption[]; busy: boolean; interrupting: boolean } {
		return {
			threadId: this.threadId,
			model: this.model,
			models: this.models,
			busy: this.state.snapshot().session.busy,
			interrupting: this.interrupting,
		};
	}

	selectModel(model: string): void {
		if (this.turnId) throw new Error("Cannot change model while Codex is working");
		if (!this.models.some((item) => item.id === model)) throw new Error(`Unknown Codex model: ${model}`);
		this.updateModel(model);
	}

	async prompt(text: string, model?: string): Promise<{ turnId: string }> {
		const clean = text.replace(/\s+/g, " ").trim();
		if (!clean) throw new Error("Prompt cannot be empty");
		if (!this.threadId) throw new Error("Codex session has not started");
		if (this.turnId || this.startingTurn) throw new Error("Codex is already working");
		this.startingTurn = true;
		this.state.setTask(MAIN, clean.slice(0, 300));
		this.state.updateSession({ busy: true });
		this.state.setState(MAIN, "thinking", "接到新需求");
		if (model && model !== this.model) this.selectModel(model);
		const params: JsonObject = {
			threadId: this.threadId,
			input: [{ type: "text", text, text_elements: [] }],
		};
		if (this.effort) params.effort = this.effort;
		if (model) params.model = model;
		try {
			const result = await this.client.request("turn/start", params);
			const turnId = (result as { turn?: { id?: string } }).turn?.id;
			if (!turnId) throw new Error("Codex did not return a turn id");
			this.turnId = turnId;
			return { turnId };
		} catch (error) {
			this.state.updateSession({ busy: false });
			this.state.setState(MAIN, "error", "任务启动失败");
			throw error;
		} finally {
			this.startingTurn = false;
		}
	}

	async interrupt(): Promise<void> {
		if (!this.threadId || !this.turnId || this.interrupting) return;
		this.interrupting = true;
		this.state.setState(MAIN, "waiting", "正在停止");
		try {
			await this.client.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId });
		} catch (error) {
			this.interrupting = false;
			throw error;
		}
	}

	resolveApproval(id: number | string, allow: boolean, forSession = false): void {
		const request = this.approvals.get(id);
		if (!request) throw new Error("Approval request is no longer pending");
		this.approvals.delete(id);
		if (request.method === "item/commandExecution/requestApproval") {
			this.client.respond(id, { decision: allow ? (forSession ? "acceptForSession" : "accept") : "decline" });
		} else if (request.method === "item/fileChange/requestApproval") {
			this.client.respond(id, { decision: allow ? (forSession ? "acceptForSession" : "accept") : "decline" });
		} else {
			this.client.respondError(id, -32601, "This approval type is not supported by Agent Live yet");
		}
		this.state.setState(MAIN, "thinking", allow ? "继续推进" : "调整方案");
	}

	async close(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.approvals.clear();
		for (const timer of this.childLeaveTimers.values()) clearTimeout(timer);
		this.childLeaveTimers.clear();
		this.childAgents.clear();
		await this.client.close();
	}

	private async listModels(): Promise<CodexModelOption[]> {
		const models: CodexModelOption[] = [];
		let cursor: string | null = null;
		do {
			const result = await this.client.request("model/list", { cursor, limit: 100 });
			const page = result as { data?: Array<JsonObject>; nextCursor?: string | null };
			for (const item of page.data ?? []) {
				if (item.hidden) continue;
				const id = String(item.model ?? item.id ?? "");
				if (!id) continue;
				models.push({
					id,
					name: String(item.displayName ?? id),
					description: String(item.description ?? ""),
					isDefault: Boolean(item.isDefault),
					defaultReasoningEffort: typeof item.defaultReasoningEffort === "string" ? item.defaultReasoningEffort : undefined,
				});
			}
			cursor = page.nextCursor ?? null;
		} while (cursor);
		return models;
	}

	private async readSourceConfiguration(): Promise<{ model: string; effort: string }> {
		if (!this.options.sourceThreadId) return { model: "", effort: "" };
		try {
			const result = await this.client.request("thread/read", {
				threadId: this.options.sourceThreadId,
				includeTurns: false,
			});
			const thread = (result as { thread?: JsonObject }).thread;
			return {
				model: String(thread?.model ?? ""),
				effort: String(thread?.reasoningEffort ?? thread?.reasoning_effort ?? ""),
			};
		} catch {
			return { model: "", effort: "" };
		}
	}

	private handleMessage(message: AppServerMessage): void {
		if (message.id !== undefined && message.method) {
			this.handleServerRequest(message);
			return;
		}
		const params = message.params ?? {};
		const agentId = this.agentIdFor(params);
		switch (message.method) {
			case "turn/started":
				if (agentId !== MAIN) {
					this.state.setState(agentId, "thinking", "开始协作");
					break;
				}
				this.turnId = String((params.turn as JsonObject | undefined)?.id ?? this.turnId);
				this.interrupting = false;
				this.state.updateSession({ busy: true });
				this.state.setState(MAIN, "thinking", "构思中");
				break;
			case "item/started":
				this.itemStarted(params.item as Item | undefined, agentId);
				break;
			case "item/completed":
				this.itemCompleted(params.item as Item | undefined, agentId);
				break;
			case "item/reasoning/summaryTextDelta":
				if (!this.acceptAgentEvent(agentId)) break;
				this.state.pushThought(agentId, String(params.delta ?? ""));
				if (!this.hasActiveAction(agentId)) this.state.setState(agentId, "thinking", "思考中");
				break;
			case "item/agentMessage/delta":
				if (!this.acceptAgentEvent(agentId)) break;
				if (!this.hasActiveAction(agentId)) this.state.setState(agentId, "talking", "汇报中");
				break;
			case "thread/tokenUsage/updated": {
				const tokenUsage = params.tokenUsage as JsonObject | undefined;
				const total = tokenUsage?.total as JsonObject | undefined;
				this.state.addUsage(agentId, Number(total?.totalTokens ?? 0), 0);
				break;
			}
			case "model/rerouted": {
				const model = String(params.toModel ?? "");
				if (!model) break;
				this.updateModel(model);
				break;
			}
			case "turn/completed": {
				if (agentId !== MAIN) {
					const childStatus = String((params.turn as JsonObject | undefined)?.status ?? "completed");
					this.finishChild(agentId, childStatus === "completed");
					break;
				}
				this.state.flushThoughts();
				for (const [id, action] of this.activeActions) this.state.endAction(action.agentId, id, false);
				this.activeActions.clear();
				const status = String((params.turn as JsonObject | undefined)?.status ?? "completed");
				this.turnId = "";
				this.interrupting = false;
				this.turns += 1;
				this.state.updateSession({ busy: false, turns: this.turns });
				this.state.setState(MAIN, status === "failed" ? "error" : "idle", status === "failed" ? "任务失败" : "待命");
				this.settleChildren(status !== "failed");
				break;
			}
		}
	}

	private updateModel(model: string): void {
		this.model = model;
		this.state.updateSession({ model });
		this.state.join(MAIN, { name: "科迪", role: model, model });
	}

	private itemStarted(item: Item | undefined, agentId: string): void {
		if (!item?.id || !item.type) return;
		if (!this.acceptAgentEvent(agentId)) return;
		const mapped = mapItem(item);
		if (!mapped) return;
		this.activeActions.set(item.id, { agentId });
		this.state.startAction(agentId, item.id, mapped.action, mapped.label);
	}

	private itemCompleted(item: Item | undefined, fallbackAgentId: string): void {
		if (!item?.id || !item.type) return;
		if (item.type === "collabAgentToolCall") this.syncCollaboration(item);
		if (item.type === "subAgentActivity" || item.type === "SubAgentActivity") this.syncSubAgentActivity(item);
		const agentId = this.activeActions.get(item.id)?.agentId ?? fallbackAgentId;
		if (!this.acceptAgentEvent(agentId)) return;
		if (item.type === "agentMessage") {
			this.state.flushThoughts();
			if (item.text) this.state.say(agentId, item.text);
			return;
		}
		if (!this.activeActions.delete(item.id)) return;
		const ok = !["failed", "declined"].includes(String(item.status ?? "completed"));
		this.state.endAction(agentId, item.id, ok);
		if (agentId !== MAIN || this.state.snapshot().session.busy) {
			this.state.setState(agentId, "thinking", ok ? "继续推进" : "处理报错");
		}
	}

	private syncSubAgentActivity(item: Item): void {
		const threadId = String(item.agentThreadId ?? item.agent_thread_id ?? "");
		if (!threadId) return;
		const childId = `codex:${threadId}`;
		const kind = String(item.kind ?? item.status ?? "").toLowerCase();
		const agentPath = String(item.agentPath ?? item.agent_path ?? "");
		const name = agentPath.split("/").filter(Boolean).at(-1) || "Teammate";
		this.childAgents.set(threadId, childId);
		if (["completed", "failed", "errored", "cancelled", "shutdown"].includes(kind)) {
			this.finishChild(childId, kind === "completed");
			return;
		}
		const existing = this.state.getAgent(childId);
		if (!existing) {
			this.state.join(childId, { name, role: "Subagent", parent: MAIN, task: name });
			this.state.delegate(MAIN, childId, name);
		} else if (name !== "Teammate" && existing.name !== name) {
			this.state.join(childId, { name, role: "Subagent", parent: MAIN, task: existing.task ?? name });
		}
		this.state.setState(childId, kind === "started" ? "thinking" : "working", kind === "started" ? "接到协作任务" : "协作中");
	}

	private agentIdFor(params: JsonObject): string {
		const threadId = String(params.threadId ?? params.thread_id ?? "");
		return this.childAgents.get(threadId) ?? MAIN;
	}

	private acceptAgentEvent(agentId: string): boolean {
		return agentId !== MAIN || this.state.snapshot().session.busy;
	}

	private hasActiveAction(agentId: string): boolean {
		for (const action of this.activeActions.values()) if (action.agentId === agentId) return true;
		return false;
	}

	private syncCollaboration(item: Item): void {
		const tool = String(item.tool ?? "");
		const receivers = (item.receiverAgents ?? item.receiver_agents ?? []) as ReceiverAgent[];
		const receiverThreadIds = (item.receiverThreadIds ?? item.receiver_thread_ids ?? []) as string[];
		const prompt = String(item.prompt ?? "协作任务").replace(/\s+/g, " ").trim().slice(0, 300);
		const targets = [
			...receivers.map((receiver) => ({
				threadId: String(receiver.threadId ?? receiver.thread_id ?? ""),
				name: String(receiver.agentNickname ?? receiver.agent_nickname ?? "Teammate"),
			})),
			...receiverThreadIds.map((threadId) => ({ threadId: String(threadId), name: "Teammate" })),
		];
		for (const receiver of targets) {
			const threadId = receiver.threadId;
			if (!threadId) continue;
			const childId = `codex:${threadId}`;
			const name = receiver.name;
			this.childAgents.set(threadId, childId);
			if (!this.state.getAgent(childId)) {
				this.state.join(childId, { name, role: "Subagent", parent: MAIN, task: prompt });
				this.state.delegate(MAIN, childId, prompt);
				this.state.setState(childId, "thinking", "接到协作任务");
			}
		}

		const states = (item.agentsStates ?? item.agents_states ?? {}) as Record<string, unknown>;
		for (const [threadId, rawState] of Object.entries(states)) {
			const childId = this.childAgents.get(threadId);
			if (!childId) continue;
			const state = typeof rawState === "string" ? rawState : Object.keys((rawState ?? {}) as JsonObject)[0] ?? "";
			if (["completed", "failed", "errored", "cancelled", "shutdown"].includes(state)) {
				this.finishChild(childId, state === "completed");
			} else if (tool !== "spawn_agent") {
				this.state.setState(childId, "working", "协作中");
			}
		}
	}

	private settleChildren(ok: boolean): void {
		for (const childId of this.childAgents.values()) this.finishChild(childId, ok);
	}

	private finishChild(childId: string, ok: boolean): void {
		if (!this.state.getAgent(childId) || this.childLeaveTimers.has(childId)) return;
		this.state.setState(childId, ok ? "done" : "error", ok ? "已交付" : "未完成");
		const timer = setTimeout(() => {
			this.childLeaveTimers.delete(childId);
			for (const [threadId, id] of this.childAgents) if (id === childId) this.childAgents.delete(threadId);
			this.state.leave(childId, ok);
		}, 2600);
		timer.unref?.();
		this.childLeaveTimers.set(childId, timer);
	}

	private handleServerRequest(message: AppServerMessage): void {
		if (message.id === undefined || !message.method) return;
		if (!["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(message.method)) {
			this.client.respondError(message.id, -32601, "Unsupported Agent Live client request");
			return;
		}
		this.approvals.set(message.id, message);
		const params = message.params ?? {};
		const isCommand = message.method.includes("commandExecution");
		const detail = String(isCommand ? params.command ?? params.reason ?? "执行命令" : params.reason ?? "修改文件");
		this.state.setState(MAIN, "waiting", "等待你的确认");
		this.options.onApproval?.({
			id: message.id,
			method: message.method,
			title: isCommand ? "允许执行命令？" : "允许修改文件？",
			detail: detail.slice(0, 300),
		});
	}
}

function mapItem(item: Item): { action: OfficeAction; label: string } | null {
	switch (item.type) {
		case "commandExecution":
			return { action: "server", label: labelForTool("bash", { command: item.command }) };
		case "fileChange":
			return { action: "type", label: "修改代码" };
		case "mcpToolCall":
		case "dynamicToolCall": {
			const tool = String(item.tool ?? "tool");
			const args = (item.arguments ?? {}) as Record<string, unknown>;
			return { action: actionForTool(tool), label: labelForTool(tool, args) };
		}
		case "webSearch":
			return { action: "phone", label: "联网检索" };
		case "imageView":
			return { action: "archive", label: "查看图片" };
		case "collabAgentToolCall":
			return { action: "delegate", label: "协调同事" };
		default:
			return null;
	}
}
