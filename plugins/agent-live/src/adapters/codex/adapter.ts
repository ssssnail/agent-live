import { actionForTool, labelForTool } from "../../core/mapping.ts";
import type { OfficeAction } from "../../core/protocol.ts";
import type { OfficeState } from "../../core/state.ts";
import { CodexAppServerClient, type AppServerMessage, type JsonObject } from "./app-server-client.ts";
import type { AdapterDescriptor } from "../contract.ts";

export const CODEX_ADAPTER: AdapterDescriptor = {
	id: "codex",
	name: "Codex",
	capabilities: { observe: true, prompt: true, interrupt: true, modelSelect: true, approvals: true, subagents: false },
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
}

type Item = JsonObject & { id?: string; type?: string; status?: string; text?: string };

/** Owns one Codex thread and translates its live App Server stream to OfficeState. */
export class CodexOfficeSession {
	private readonly state: OfficeState;
	private readonly client: CodexAppServerClient;
	private readonly options: {
		cwd: string;
		onApproval?: (approval: PendingApproval) => void;
	};
	private threadId = "";
	private turnId = "";
	private startingTurn = false;
	private turns = 0;
	private readonly activeActions = new Set<string>();
	private readonly approvals = new Map<number | string, AppServerMessage>();
	private unsubscribe: (() => void) | null = null;
	private models: CodexModelOption[] = [];
	private model = "";

	constructor(state: OfficeState, client: CodexAppServerClient, options: {
			cwd: string;
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
		const result = await this.client.request("thread/start", {
			cwd: this.options.cwd,
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			serviceName: "Agent Live",
		});
		const response = result as { thread?: { id?: string }; model?: string };
		if (!response.thread?.id) throw new Error("Codex did not return a thread id");
		this.threadId = response.thread.id;
		const model = response.model ?? "codex";
		this.model = model;
		this.state.updateSession({ cwd: this.options.cwd, model, busy: false });
		this.state.join(MAIN, { name: "Codex", role: model, model });
		return { threadId: this.threadId, model, models: this.models };
	}

	getStatus(): { threadId: string; model: string; models: CodexModelOption[]; busy: boolean } {
		return {
			threadId: this.threadId,
			model: this.model,
			models: this.models,
			busy: this.state.snapshot().session.busy,
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
		if (!this.threadId || !this.turnId) return;
		await this.client.request("turn/interrupt", { threadId: this.threadId, turnId: this.turnId });
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
				});
			}
			cursor = page.nextCursor ?? null;
		} while (cursor);
		return models;
	}

	private handleMessage(message: AppServerMessage): void {
		if (message.id !== undefined && message.method) {
			this.handleServerRequest(message);
			return;
		}
		const params = message.params ?? {};
		switch (message.method) {
			case "turn/started":
				this.turnId = String((params.turn as JsonObject | undefined)?.id ?? this.turnId);
				this.state.updateSession({ busy: true });
				this.state.setState(MAIN, "thinking", "构思中");
				break;
			case "item/started":
				this.itemStarted(params.item as Item | undefined);
				break;
			case "item/completed":
				this.itemCompleted(params.item as Item | undefined);
				break;
			case "item/reasoning/summaryTextDelta":
				this.state.pushThought(MAIN, String(params.delta ?? ""));
				if (!this.activeActions.size) this.state.setState(MAIN, "thinking", "思考中");
				break;
			case "item/agentMessage/delta":
				if (!this.activeActions.size) this.state.setState(MAIN, "talking", "汇报中");
				break;
			case "thread/tokenUsage/updated": {
				const tokenUsage = params.tokenUsage as JsonObject | undefined;
				const total = tokenUsage?.total as JsonObject | undefined;
				this.state.addUsage(MAIN, Number(total?.totalTokens ?? 0), 0);
				break;
			}
			case "model/rerouted": {
				const model = String(params.toModel ?? "");
				if (!model) break;
				this.updateModel(model);
				break;
			}
			case "turn/completed": {
				this.state.flushThoughts();
				for (const id of this.activeActions) this.state.endAction(MAIN, id, false);
				this.activeActions.clear();
				const status = String((params.turn as JsonObject | undefined)?.status ?? "completed");
				this.turnId = "";
				this.turns += 1;
				this.state.updateSession({ busy: false, turns: this.turns });
				this.state.setState(MAIN, status === "failed" ? "error" : "idle", status === "failed" ? "任务失败" : "待命");
				break;
			}
		}
	}

	private updateModel(model: string): void {
		this.model = model;
		this.state.updateSession({ model });
		this.state.join(MAIN, { name: "Codex", role: model, model });
	}

	private itemStarted(item: Item | undefined): void {
		if (!item?.id || !item.type) return;
		const mapped = mapItem(item);
		if (!mapped) return;
		this.activeActions.add(item.id);
		this.state.startAction(MAIN, item.id, mapped.action, mapped.label);
	}

	private itemCompleted(item: Item | undefined): void {
		if (!item?.id || !item.type) return;
		if (item.type === "agentMessage") {
			this.state.flushThoughts();
			if (item.text) this.state.say(MAIN, item.text);
			return;
		}
		if (!this.activeActions.delete(item.id)) return;
		const ok = !["failed", "declined"].includes(String(item.status ?? "completed"));
		this.state.endAction(MAIN, item.id, ok);
		this.state.setState(MAIN, "thinking", ok ? "继续推进" : "处理报错");
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
