import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { actionForTool, describeDelegation, isDelegationTool, labelForTool } from "./mapping.ts";
import type { OfficeServer } from "./server.ts";
import { startServer } from "./server.ts";
import { OfficeState } from "./state.ts";

const MAIN = "main";
const DEFAULT_PORT = Number(process.env.PI_OFFICE_PORT ?? 7788);
const VIEWER_PATH = "v2.html";
const PRESETS = new Map([
	["demo-office", "原版 Demo（基准）"],
	["lively-office", "有生活的像素办公室"],
	["night-shift", "雨夜加班办公室"],
	["cozy-studio", "暖调创意工作室"],
	["old-school-office", "老派企业办公室"],
	["boardroom-office", "大会议室长桌办公"],
]);

const ROLE_NAMES: Record<string, string> = {
	scout: "侦察员",
	planner: "规划师",
	reviewer: "评审员",
	worker: "工程师",
	tester: "测试员",
	writer: "文案",
};

function roleName(agent: string): string {
	return ROLE_NAMES[agent.toLowerCase()] ?? "外援";
}

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
	/** Streaming cursors so we only forward newly generated thinking text. */
	let thinkingCursor = 0;
	let textCursor = 0;
	let totalTokens = 0;
	let totalCost = 0;
	/** toolCallId -> child agent ids currently on loan from the delegation tool. */
	const delegated = new Map<string, string[]>();

	const mainName = (ctx: any): { name: string; role: string } => {
		const model = ctx?.model?.id ?? ctx?.model?.name ?? "pi";
		return { name: "阿派", role: String(model) };
	};

	async function boot(ctx: any): Promise<void> {
		if (state) return;
		state = new OfficeState(ctx.cwd ?? process.cwd());
		state.updateSession({
			cwd: ctx.cwd ?? process.cwd(),
			model: ctx?.model?.id,
			thinkingLevel: ctx?.thinkingLevel,
		});
		const info = mainName(ctx);
		state.join(MAIN, { ...info, model: ctx?.model?.id });
		try {
			server = await startServer(state, { port: DEFAULT_PORT });
			if (ctx.hasUI) {
				ctx.ui.setStatus("office", `office: ${server.url}/${VIEWER_PATH}`);
				ctx.ui.notify(`Agent Office: ${server.url}/${VIEWER_PATH} (/office 打开)`, "info");
			}
			if (process.env.PI_OFFICE_AUTO_OPEN === "1") server.open(VIEWER_PATH);
		} catch (err) {
			const message = `Agent Office 启动失败: ${(err as Error).message}`;
			if (ctx.hasUI) ctx.ui.notify(message, "error");
			else console.error(message);
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		await boot(ctx);
	});

	pi.on("session_shutdown", async () => {
		await server?.close();
		server = null;
		state?.dispose();
		state = null;
		delegated.clear();
	});

	pi.on("model_select", async (event: any) => {
		state?.updateSession({ model: event?.model?.id });
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
			state.join(childId, {
				name: item.agent,
				role: roleName(item.agent),
				parent: MAIN,
				task: item.task,
			});
			state.delegate(MAIN, childId, item.task);
			state.setState(childId, "thinking", "接活儿");
			children.push(childId);
		}
		delegated.set(toolCallId, children);
		state.setState(MAIN, "waiting", `等待 ${children.length} 位同事`);
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
				state.setState(childId, ok ? "done" : "error", ok ? "交付" : "失败");
			}
			const leaving = [...children];
			delegated.delete(toolCallId);
			setTimeout(() => {
				for (const childId of leaving) state?.leave(childId, ok);
			}, 2600).unref?.();
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
				state.addUsage(childId, tokens, Number(usage.cost ?? 0));
			}

			// The delegation tool reports exitCode -1 while a worker is still running.
			const exitCode = Number(result?.exitCode ?? -1);
			if (exitCode !== -1) {
				const failed =
					exitCode !== 0 || result?.stopReason === "error" || result?.stopReason === "aborted";
				state.setState(childId, failed ? "error" : "done", failed ? "失败" : "已交付");
				return;
			}

			const messages: any[] = Array.isArray(result?.messages) ? result.messages : [];
			const last = [...messages].reverse().find((m) => m?.role === "assistant");
			const toolCall = last?.content?.find?.((c: any) => c?.type === "toolCall");
			const thinking = joinBlocks(last?.content, "thinking");
			const text = joinBlocks(last?.content, "text");

			if (toolCall) {
				const label = labelForTool(String(toolCall.name), toolCall.arguments ?? {});
				state.startAction(childId, `${childId}:${messages.length}`, actionForTool(String(toolCall.name)), label);
			} else if (thinking.trim()) {
				state.setState(childId, "thinking", "思考中");
				state.pushThought(childId, thinking.slice(-200));
			} else if (text.trim()) {
				state.setState(childId, "talking", "整理结论");
			}
		});
	}

	pi.registerCommand("office", {
		description: "打开 Agent Office 可视化 (demo | status | preset [id])",
		handler: async (args: string, ctx: any) => {
			await boot(ctx);
			const sub = (args ?? "").trim().toLowerCase();
			const [command, value, ...rest] = sub.split(/\s+/).filter(Boolean);

			if (!server) {
				ctx.ui.notify("Agent Office 服务未启动", "error");
				return;
			}
			if (command === "status") {
				ctx.ui.notify(`Agent Office: ${server.url}/${VIEWER_PATH}`, "info");
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
					ctx.ui.notify(`未知 Preset：${[value, ...rest].filter(Boolean).join(" ")}。输入 /office preset 查看可用选项。`, "error");
					return;
				}
				server.open(`${VIEWER_PATH}?preset=${encodeURIComponent(value)}`);
				ctx.ui.notify(`已打开 ${PRESETS.get(value)}；浏览器会记住这次选择`, "info");
				return;
			}
			if (command && command !== "open") {
				ctx.ui.notify("用法：/office [demo | status | preset [id]]", "error");
				return;
			}
			server.open(VIEWER_PATH);
			ctx.ui.notify(`已打开 ${server.url}/${VIEWER_PATH}`, "info");
		},
	});
}
