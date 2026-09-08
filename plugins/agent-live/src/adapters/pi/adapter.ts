import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { actionForTool, describeDelegation, isDelegationTool, labelForTool } from "../../core/mapping.ts";
import type { OfficeServer } from "../../runtime/server.ts";
import { OfficeState } from "../../core/state.ts";
import { AgentLiveRuntime } from "../../runtime/agent-live-runtime.ts";
import type { AdapterDescriptor } from "../contract.ts";
import { AgentRegistry } from "../../core/agents.ts";

export const PI_ADAPTER: AdapterDescriptor = {
	id: "pi",
	name: "Pi",
	capabilities: { observe: true, prompt: false, interrupt: false, modelSelect: true, approvals: false, subagents: true },
};

const MAIN = "main";
const DEFAULT_PORT = Number(process.env.AGENT_LIVE_PI_PORT ?? 7788);
const VIEWER_PATH = "v2.html";
const PRESETS = new Map([
	["tech-open-office", "Tech 开放式办公室"],
	["boardroom-office", "长形会议室"],
	["old-school-office", "老式办公室"],
]);

type Block = { type: string; text?: string; thinking?: string };

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
	/** Streaming cursors so we only forward newly generated thinking text. */
	let thinkingCursor = 0;
	let textCursor = 0;
	let totalTokens = 0;
	let totalCost = 0;
	/** toolCallId -> child agent ids currently on loan from the delegation tool. */
	const delegated = new Map<string, string[]>();

	const mainName = (ctx: any): { name: string; role: string } => {
		const model = ctx?.model?.id ?? ctx?.model?.name ?? "pi";
		return { name: "啊派", role: String(model) };
	};

	async function boot(ctx: any): Promise<void> {
		if (state) return;
		runtime = new AgentLiveRuntime(ctx.cwd ?? process.cwd());
		state = runtime.state;
		agents = new AgentRegistry(state);
		state.updateSession({
			cwd: ctx.cwd ?? process.cwd(),
			model: ctx?.model?.id,
			thinkingLevel: ctx?.thinkingLevel,
		});
		const info = mainName(ctx);
		agents.join(MAIN, { ...info, model: ctx?.model?.id });
		try {
			server = await runtime.start({ port: DEFAULT_PORT });
			if (ctx.hasUI) {
				ctx.ui.setStatus("agent-live", `agent-live: ${server.url}/${VIEWER_PATH}`);
				ctx.ui.notify(`Agent Live: ${server.url}/${VIEWER_PATH} (/agent-live 打开)`, "info");
			}
			if (process.env.AGENT_LIVE_AUTO_OPEN === "1") server.open(VIEWER_PATH);
		} catch (err) {
			const message = `Agent Live 启动失败: ${(err as Error).message}`;
			if (ctx.hasUI) ctx.ui.notify(message, "error");
			else console.error(message);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		await boot(ctx);
	});

	pi.on("session_shutdown", async () => {
		agents?.dispose();
		await runtime?.close();
		server = null;
		state = null;
		runtime = null;
		agents = null;
		delegated.clear();
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
		if (!state) return;
		const message = event?.message;
		if (message?.role !== "assistant") return;

		state.flushThoughts();
		const text = joinBlocks(message.content, "text");
		if (text.trim()) state.say(MAIN, text);

		const usage = message.usage;
		if (usage) {
			totalTokens += Number(usage.totalTokens ?? 0);
			totalCost += Number(usage.cost?.total ?? 0);
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
		description: "打开 Agent Live 可视化 (demo | status | close | preset [id])",
		handler: async (args: string, ctx: any) => {
			const sub = (args ?? "").trim().toLowerCase();
			const [command, value, ...rest] = sub.split(/\s+/).filter(Boolean);
			if (command === "close") {
				agents?.dispose();
				await runtime?.close();
				server = null;
				state = null;
				runtime = null;
				agents = null;
				delegated.clear();
				ctx.ui.notify("Agent Live 已关闭", "info");
				return;
			}
			await boot(ctx);

			if (!server) {
				ctx.ui.notify("Agent Live 服务未启动", "error");
				return;
			}
			if (command === "status") {
				ctx.ui.notify(`Agent Live: ${server.url}/${VIEWER_PATH}`, "info");
				return;
			}
			if (command === "demo") {
				server.open(`${VIEWER_PATH}?demo=1`);
				ctx.ui.notify("已打开演示场景", "info");
				return;
			}
			if (command === "preset") {
				if (!value) {
					const options = [...PRESETS.entries()].map(([id, name]) => `${id}（${name}）`).join("、");
					ctx.ui.notify(`可用 Preset：${options}`, "info");
					return;
				}
				if (rest.length || !PRESETS.has(value)) {
					ctx.ui.notify(`未知 Preset：${[value, ...rest].filter(Boolean).join(" ")}。输入 /agent-live preset 查看可用选项。`, "error");
					return;
				}
				server.open(`${VIEWER_PATH}?preset=${encodeURIComponent(value)}`);
				ctx.ui.notify(`已打开 ${PRESETS.get(value)}；浏览器会记住这次选择`, "info");
				return;
			}
			if (command && command !== "open") {
				ctx.ui.notify("用法：/agent-live [demo | status | close | preset [id]]", "error");
				return;
			}
			server.open(VIEWER_PATH);
			ctx.ui.notify(`已打开 ${server.url}/${VIEWER_PATH}`, "info");
		},
	});
}
