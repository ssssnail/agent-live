import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { actionForTool, describeDelegation, isDelegationTool, labelForTool } from "../../core/mapping.ts";
import type { OfficeServer } from "../../runtime/server.ts";
import { OfficeState } from "../../core/state.ts";
import { AgentLiveRuntime } from "../../runtime/agent-live-runtime.ts";
import { AgentRegistry } from "../../core/agents.ts";
import { randomBytes } from "node:crypto";
import { OfficeContentService } from "../../runtime/content-service.ts";
import { CreatorService } from "../../creator/service.ts";
import { CreatorCommandRouter } from "../../creator/commands.ts";
import { CreatorModeRegistry, CREATOR_MODE_CONTEXT } from "../../creator/mode.ts";

const MAIN = "main";
const PI_CREATOR_SESSION = "pi-current-session";
const DEFAULT_PORT = Number(process.env.AGENT_LIVE_PI_PORT ?? 7788);
const VIEWER_CLOSE_GRACE_MS = Number(process.env.AGENT_LIVE_VIEWER_CLOSE_GRACE_MS ?? 12_000);
const VIEWER_PATH = "v2.html";

type Block = { type: string; text?: string; thinking?: string };

const CREATOR_TOOL_PARAMETERS = {
	type: "object",
	additionalProperties: false,
	properties: {
		command: {
			type: "string",
			enum: ["list_offices", "list_components", "customize"],
		},
		base: { type: "string" },
		category: { type: "string", enum: ["summary", "room", "npcs", "props", "activities", "appearance", "environment", "all"] },
		patch: { type: "object" },
	},
	required: ["command"],
} as any;

const CREATOR_TOOL_GUIDELINES = [
	"Use agent_live_creator for office changes only while Agent Live Creator Mode is active. The user enters with /agent-live custom and exits with /agent-live exit.",
	"For common changes, call customize directly. Query list_components only when a choice is unknown; request the narrowest category and avoid all unless the user explicitly asks for the complete capability catalog.",
	"Keep schemas, component IDs and patches internal. After applying, summarize defaults, substitutions, ignored requests and source-code-only boundaries.",
];

function joinBlocks(content: unknown, kind: "text" | "thinking"): string {
	if (typeof content === "string") return kind === "text" ? content : "";
	if (!Array.isArray(content)) return "";
	return (content as Block[])
		.filter((block) => block?.type === kind)
		.map((block) => (kind === "thinking" ? block.thinking : block.text) ?? "")
		.join("\n");
}

export default function (pi: ExtensionAPI) {
	let state: OfficeState | null = null;
	let server: OfficeServer | null = null;
	let runtime: AgentLiveRuntime | null = null;
	let agents: AgentRegistry | null = null;
	let creator: CreatorCommandRouter | null = null;
	let creatorService: CreatorService | null = null;
	let accessToken = "";
	let closePromise: Promise<void> | null = null;
	let bootPromise: Promise<void> | null = null;
	let viewerCloseTimer: ReturnType<typeof setTimeout> | null = null;
	let hasSeenViewer = false;
	/** Streaming cursors so we only forward newly generated thinking text. */
	let thinkingCursor = 0;
	let textCursor = 0;
	let totalTokens = 0;
	let totalCost = 0;
	/** toolCallId -> child agent ids currently on loan from the delegation tool. */
	const delegated = new Map<string, string[]>();
	/** Tool calls can be interrupted before Pi emits their normal end event. */
	const activeToolCalls = new Set<string>();
	const creatorModes = new CreatorModeRegistry();

	const mainName = (ctx: any): { name: string; role: string } => {
		const model = ctx?.model?.id ?? ctx?.model?.name ?? "pi";
		return { name: "啊派", role: String(model) };
	};

	async function bootOnce(ctx: any): Promise<void> {
		if (closePromise) await closePromise.catch(() => undefined);
		if (state && server) return;
		try {
			// Reopening a Viewer is not a new host session. Recover persisted usage
			// when available; otherwise retain the lightweight session counters.
			const branch = ctx.sessionManager?.getBranch?.();
			if (Array.isArray(branch)) {
				totalTokens = 0;
				totalCost = 0;
				for (const entry of branch) {
					const message = entry?.message;
					if (message?.role !== "assistant") continue;
					totalTokens += Number(message.usage?.totalTokens ?? 0);
					totalCost += Number(message.usage?.cost?.total ?? 0);
				}
			}
			const nextRuntime = new AgentLiveRuntime(ctx.cwd ?? process.cwd());
			runtime = nextRuntime;
			state = nextRuntime.state;
			agents = new AgentRegistry(state);
			hasSeenViewer = false;
			const content = await OfficeContentService.create();
			creatorService = new CreatorService(content.registry, content.library);
			creator = new CreatorCommandRouter(creatorService);
			const creatorToken = randomBytes(24).toString("hex");
			accessToken = creatorToken;
			state.updateSession({
				cwd: ctx.cwd ?? process.cwd(),
				model: ctx?.model?.id,
				thinkingLevel: ctx?.thinkingLevel,
			});
			const info = mainName(ctx);
			agents.join(MAIN, { ...info, model: ctx?.model?.id });
			state.addUsage(MAIN, totalTokens, totalCost);
			server = await nextRuntime.start({
				port: DEFAULT_PORT,
				content,
				creator,
				creatorToken,
				onViewerCountChange(count) {
					if (runtime !== nextRuntime) return;
					if (count > 0) {
						hasSeenViewer = true;
						if (viewerCloseTimer) clearTimeout(viewerCloseTimer);
						viewerCloseTimer = null;
						return;
					}
					if (!hasSeenViewer || viewerCloseTimer) return;
					viewerCloseTimer = setTimeout(() => void shutdown(), VIEWER_CLOSE_GRACE_MS);
					viewerCloseTimer.unref?.();
				},
			});
			if (ctx.hasUI) {
				ctx.ui.setStatus("agent-live", `agent-live: ${viewerUrl(server.url)}`);
				ctx.ui.notify(`Agent Live: ${viewerUrl(server.url)} (/agent-live 打开)`, "info");
			}
			if (process.env.AGENT_LIVE_AUTO_OPEN === "1") server.open(viewerTarget());
		} catch (err) {
			agents?.dispose();
			await runtime?.close().catch(() => undefined);
			server = null;
			state = null;
			runtime = null;
			agents = null;
			creator = null;
			creatorService = null;
			const message = `Agent Live 启动失败: ${(err as Error).message}`;
			if (ctx.hasUI) ctx.ui.notify(message, "error");
			else console.error(message);
		}
	}

	async function boot(ctx: any): Promise<void> {
		if (server && state) return;
		if (bootPromise) return bootPromise;
		bootPromise = bootOnce(ctx).finally(() => { bootPromise = null; });
		return bootPromise;
	}

	async function shutdown(): Promise<void> {
		creatorModes.clear();
		if (closePromise) return closePromise;
		if (viewerCloseTimer) clearTimeout(viewerCloseTimer);
		viewerCloseTimer = null;
		hasSeenViewer = false;
		const runtimeToClose = runtime;
		const agentsToDispose = agents;
		server = null;
		state = null;
		runtime = null;
		agents = null;
		creator = null;
		creatorService = null;
		accessToken = "";
		delegated.clear();
		activeToolCalls.clear();
		closePromise = (async () => {
			agentsToDispose?.dispose();
			await runtimeToClose?.close();
		})().finally(() => { closePromise = null; });
		return closePromise;
	}

	function viewerTarget(params: Record<string, string> = {}): string {
		const query = new URLSearchParams({ ...params, ...(accessToken ? { token: accessToken } : {}) });
		return `${VIEWER_PATH}${query.size ? `?${query}` : ""}`;
	}

	function viewerUrl(base: string, params: Record<string, string> = {}): string {
		return `${base}/${viewerTarget(params)}`;
	}

	pi.on("session_start", async (_event, ctx) => {
		totalTokens = 0;
		totalCost = 0;
		await boot(ctx);
	});

	pi.on("session_shutdown", async () => {
		creatorModes.clear();
		await shutdown();
	});

	pi.on("model_select", async (event: any) => {
		if (!state) return;
		const model = String(event?.model?.id ?? event?.model?.name ?? "pi");
		state.updateSession({ model });
		agents?.join(MAIN, { name: "啊派", role: model, model });
	});

	pi.on("thinking_level_select", async (event: any) => {
		state?.updateSession({ thinkingLevel: event?.level });
	});

	pi.on("before_agent_start", async (event: any) => {
		if (!state) return;
		state.updateSession({ busy: true });
		state.setTask(MAIN, String(event?.prompt ?? "").replace(/\s+/g, " ").slice(0, 300));
		state.setState(MAIN, "thinking", "接到新需求");
		if (creatorModes.isActive(PI_CREATOR_SESSION)) {
			return { systemPrompt: `${event?.systemPrompt ?? ""}\n\n${CREATOR_MODE_CONTEXT}`.trim() };
		}
	});

	pi.registerTool({
		name: "agent_live_creator",
		label: "Agent Live Creator",
		description: "Inspect Agent Live capabilities or directly apply a validated Custom Office change.",
		promptSnippet: "Directly customize an Agent Live office from a natural-language request",
		promptGuidelines: CREATOR_TOOL_GUIDELINES,
		parameters: CREATOR_TOOL_PARAMETERS,
		async execute(_toolCallId: string, params: unknown, _signal: AbortSignal, _onUpdate: unknown, ctx: any) {
			if (!creator || !server) await boot(ctx);
			if (!creator) {
				return { content: [{ type: "text", text: JSON.stringify({ ok: false, error: "Agent Live is not running." }) }], details: { ok: false } };
			}
			const result = await creator.execute(params);
			return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
		},
	});

	pi.on("message_start", async (event: any) => {
		if (!state) return;
		if (event?.message?.role !== "assistant") return;
		thinkingCursor = 0;
		textCursor = 0;
		state.setState(MAIN, "thinking", "构思中");
	});

	pi.on("message_update", async (event: any) => {
		if (!state) return;
		const message = event?.message;
		if (message?.role !== "assistant") return;

		const thinking = joinBlocks(message.content, "thinking");
		if (thinking.length > thinkingCursor) {
			state.pushThought(MAIN, thinking.slice(thinkingCursor));
			thinkingCursor = thinking.length;
			if (state.getAgent(MAIN)?.state !== "working") {
				state.setState(MAIN, "thinking", "思考中");
			}
		}

		const text = joinBlocks(message.content, "text");
		if (text.length > textCursor) {
			textCursor = text.length;
			if (state.getAgent(MAIN)?.state === "thinking") {
				state.setState(MAIN, "talking", "汇报中");
			}
		}
	});

	pi.on("message_end", async (event: any) => {
		const message = event?.message;
		if (message?.role !== "assistant") return;
		const usage = message.usage;
		if (usage) {
			totalTokens += Number(usage.totalTokens ?? 0);
			totalCost += Number(usage.cost?.total ?? 0);
		}
		if (!state) return;

		state.flushThoughts();
		const text = joinBlocks(message.content, "text");
		if (text.trim()) state.say(MAIN, text);

		if (usage) {
			state.addUsage(MAIN, totalTokens, totalCost);
		}
	});

	pi.on("turn_start", async () => {
		if (!state) return;
		state.updateSession({ busy: true });
	});

	pi.on("turn_end", async (event: any) => {
		if (!state) return;
		state.updateSession({ turns: Number(event?.turnIndex ?? 0) + 1 });
	});

	pi.on("tool_execution_start", async (event: any) => {
		if (!state) return;
		const toolName = String(event?.toolName ?? "tool");
		const toolCallId = String(event?.toolCallId ?? Math.random());
		const args = (event?.args ?? {}) as Record<string, any>;

		activeToolCalls.add(toolCallId);
		state.startAction(MAIN, toolCallId, actionForTool(toolName), labelForTool(toolName, args));

		if (!isDelegationTool(toolName)) return;

		const children: string[] = [];
		for (const item of describeDelegation(args)) {
			const childId = `${toolCallId}:${item.slot}`;
			const child = agents?.spawn({
				id: childId,
				name: item.agent,
				task: item.task,
			});
			if (child) children.push(childId);
		}
		delegated.set(toolCallId, children);
	});

	pi.on("tool_execution_update", async (event: any) => {
		if (!state) return;
		const toolCallId = String(event?.toolCallId ?? "");
		if (!delegated.has(toolCallId)) return;
		syncDelegationProgress(toolCallId, event?.partialResult?.details);
	});

	pi.on("tool_execution_end", async (event: any) => {
		if (!state) return;
		const toolCallId = String(event?.toolCallId ?? "");
		const ok = !event?.isError;
		activeToolCalls.delete(toolCallId);

		const children = delegated.get(toolCallId);
		if (children) {
			syncDelegationProgress(toolCallId, event?.result?.details);
			// Keep per-worker verdicts from the progress stream; only fill in the rest.
			for (const childId of children) {
				const settled = state.getAgent(childId)?.state;
				if (settled === "done" || settled === "error") continue;
				agents?.complete(childId, ok, ok ? "已交付" : "失败");
			}
			delegated.delete(toolCallId);
		}

		state.endAction(MAIN, toolCallId, ok);
		state.setState(MAIN, "thinking", ok ? "继续推进" : "处理报错");
	});

	pi.on("agent_end", async () => {
		state?.flushThoughts();
	});

	pi.on("agent_settled", async () => {
		if (!state) return;
		state.flushThoughts();
		for (const toolCallId of activeToolCalls) state.endAction(MAIN, toolCallId, false);
		activeToolCalls.clear();
		agents?.settleChildren(false);
		delegated.clear();
		state.updateSession({ busy: false });
		state.setState(MAIN, "idle", "待命");
	});

	/** Mirror subagent progress (details.results) onto the child characters. */
	function syncDelegationProgress(toolCallId: string, details: any): void {
		if (!state || !details) return;
		const results: any[] = Array.isArray(details.results)
			? details.results
			: Array.isArray(details.tasks)
				? details.tasks
				: [];
		const children = delegated.get(toolCallId) ?? [];

		results.forEach((result, index) => {
			const childId = children[index] ?? `${toolCallId}:${index}`;
			if (!state?.getAgent(childId)) return;

			const usage = result?.usage;
			if (usage) {
				const tokens = Number(usage.contextTokens ?? 0) || Number(usage.input ?? 0) + Number(usage.output ?? 0);
				agents?.usage(childId, tokens, Number(usage.cost ?? 0));
			}

			// The delegation tool reports exitCode -1 while a worker is still running.
			const exitCode = Number(result?.exitCode ?? -1);
			if (exitCode !== -1) {
				const failed =
					exitCode !== 0 || result?.stopReason === "error" || result?.stopReason === "aborted";
				agents?.complete(childId, !failed, failed ? "失败" : "已交付");
				return;
			}

			const messages: any[] = Array.isArray(result?.messages) ? result.messages : [];
			const last = [...messages].reverse().find((m) => m?.role === "assistant");
			const toolCall = last?.content?.find?.((c: any) => c?.type === "toolCall");
			const thinking = joinBlocks(last?.content, "thinking");
			const text = joinBlocks(last?.content, "text");

			if (toolCall) {
				const label = labelForTool(String(toolCall.name), toolCall.arguments ?? {});
				agents?.startAction(childId, `${childId}:${messages.length}`, actionForTool(String(toolCall.name)), label);
			} else if (thinking.trim()) {
				agents?.setState(childId, "thinking", "思考中");
				agents?.thought(childId, thinking.slice(-200));
			} else if (text.trim()) {
				agents?.setState(childId, "talking", "整理结论");
			}
		});
	}

	pi.registerCommand("agent-live", {
		description: "打开 Agent Live 可视化 (demo | status | close | list presets | preset <number or exact name> | custom | exit)",
		handler: async (args: string, ctx: any) => {
			const raw = (args ?? "").trim().replace(/\s+/g, " ");
			const sub = raw.toLowerCase();
			const [command, value, ...rest] = sub.split(/\s+/).filter(Boolean);
			if (command === "close") {
				await shutdown();
				ctx.ui.notify("Agent Live 已关闭", "info");
				return;
			}
			if (command === "exit") {
				const exited = creatorModes.exit(PI_CREATOR_SESSION);
				ctx.ui.notify(exited ? "Creator Mode 已退出。" : "当前未处于 Creator Mode。", "info");
				return;
			}
			await boot(ctx);

			if (!server) {
				ctx.ui.notify("Agent Live 服务未启动", "error");
				return;
			}
			if (command === "status") {
				ctx.ui.notify(`Agent Live: ${viewerUrl(server.url)}`, "info");
				return;
			}
			if (command === "demo") {
				server.open(viewerTarget({ demo: "1" }));
				ctx.ui.notify("已打开演示场景", "info");
				return;
			}
			const entries = await creatorService!.listOffices();
			const listPresets = () => {
				ctx.ui.notify(entries.map((office, index) => `${index + 1}. ${office.name}${office.selected ? " (selected)" : ""}\n   /agent-live preset ${index + 1}`).join("\n") + "\n也可以使用完整名称，例如 /agent-live preset tech", "info");
			};
			const openPreset = async (selector: string | undefined) => {
				if (!selector) {
					listPresets();
					return;
				}
				// Public selection is intentionally small: listed number or exact name.
				const index = /^\d+$/.test(selector) ? Number(selector) - 1 : -1;
				const matches = entries.filter((office) => office.name.toLowerCase() === selector);
				const selected = index >= 0 ? entries[index] : matches.length === 1 ? matches[0] : undefined;
				if (!selected) {
					ctx.ui.notify(`未知 Preset：${selector}。输入 /agent-live list presets 查看可用选项。`, "error");
					return;
				}
				const result = await creatorService?.selectOffice(selected.id);
				if (!result?.selected) {
					ctx.ui.notify(`无法选择 ${selected.name}：${result?.error ?? "Creator 未就绪"}`, "error");
					return;
				}
				server!.open(viewerTarget());
				creatorModes.exit(PI_CREATOR_SESSION);
				ctx.ui.notify(`已选择 ${selected.name}。Creator Mode 已退出。`, "info");
			};
			if (command === "list" && (value === "preset" || value === "presets")) {
				listPresets();
				return;
			}
			if (command === "preset") {
				await openPreset([value, ...rest].filter(Boolean).join(" ") || undefined);
				return;
			}
		if (command === "custom") {
			creatorModes.enter(PI_CREATOR_SESSION);
			ctx.ui.notify("Creator Mode 已开启。现在直接描述办公室修改；输入 /agent-live exit 退出。", "info");
			return;
		}
		if (command && command !== "open") {
			ctx.ui.notify("用法：/agent-live [demo | status | close | list presets | preset <number or exact name> | custom | exit]", "error");
				return;
			}
			server.open(viewerTarget());
			ctx.ui.notify(`已打开 ${viewerUrl(server.url)}`, "info");
		},
	});
}
