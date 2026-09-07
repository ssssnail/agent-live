import type { OfficeAction } from "./protocol.ts";

const DELEGATION_TOOLS = /^(subagent|task|dispatch_agent|spawn_agent|agent)$/i;

/** Tools whose work maps onto a physical spot in the office. */
const ACTION_BY_TOOL: Array<[RegExp, OfficeAction]> = [
	[/^(read|ls|glob|grep|find|rg|search_files|list)/i, "archive"],
	[/^(write|edit|multi_edit|apply_patch|create|notebook)/i, "type"],
	[/^(bash|shell|exec|run|terminal)/i, "server"],
	[/^(todo|plan|task_list|note)/i, "whiteboard"],
	[/(browser|web|fetch|http|curl|search)/i, "phone"],
	[/^(ask_user|question|confirm)/i, "phone"],
];

export function isDelegationTool(toolName: string): boolean {
	return DELEGATION_TOOLS.test(toolName);
}

export function actionForTool(toolName: string): OfficeAction {
	if (isDelegationTool(toolName)) return "delegate";
	for (const [pattern, action] of ACTION_BY_TOOL) {
		if (pattern.test(toolName)) return action;
	}
	return "type";
}

function short(value: unknown, max = 64): string {
	if (value === undefined || value === null) return "";
	const text = typeof value === "string" ? value : JSON.stringify(value);
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function baseName(p: unknown): string {
	const text = short(p, 120);
	if (!text) return "";
	const parts = text.split("/");
	return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : text;
}

/** Human-readable one-liner shown in the speech bubble and the activity log. */
export function labelForTool(toolName: string, args: Record<string, any> = {}): string {
	const a = args ?? {};
	switch (true) {
		case /^read/i.test(toolName):
			return `查阅 ${baseName(a.path ?? a.file ?? a.filePath)}`;
		case /^(ls|list|glob|find)/i.test(toolName):
			return `翻找 ${baseName(a.path ?? a.pattern ?? a.glob_pattern ?? ".")}`;
		case /^(grep|rg|search)/i.test(toolName):
			return `检索 /${short(a.pattern ?? a.query, 32)}/`;
		case /^(write|create)/i.test(toolName):
			return `新建 ${baseName(a.path)}`;
		case /^(edit|multi_edit|apply_patch)/i.test(toolName):
			return `修改 ${baseName(a.path ?? a.file)}`;
		case /^(bash|shell|exec|run|terminal)/i.test(toolName):
			return `执行 ${short(a.command ?? a.cmd, 56)}`;
		case /^(todo|plan|task_list)/i.test(toolName):
			return "更新任务板";
		case /browser/i.test(toolName):
			return `联网 ${short(a.url ?? a.args ?? a.action ?? "browser", 40)}`;
		case /^(web|fetch|http|curl)/i.test(toolName):
			return `联网 ${short(a.url ?? a.search_term ?? a.query, 40)}`;
		case /^(ask_user|question|confirm)/i.test(toolName):
			return `请示 ${short(a.question, 40)}`;
		case isDelegationTool(toolName):
			return `派活 ${short(describeDelegation(a).map((t) => t.agent).join(", "), 40)}`;
		default: {
			const hint = short(a.path ?? a.command ?? a.query ?? a.name, 40);
			return hint ? `${toolName} ${hint}` : toolName;
		}
	}
}

export interface DelegatedTask {
	agent: string;
	task: string;
	/** Index used to build a stable child id for parallel/chained runs. */
	slot: number;
}

/**
 * Normalises the shapes the subagent tool accepts (single / parallel / chain)
 * into a flat list of workers to bring into the office.
 */
export function describeDelegation(args: Record<string, any> = {}): DelegatedTask[] {
	const a = args ?? {};
	const out: DelegatedTask[] = [];
	const push = (agent: unknown, task: unknown, slot: number) => {
		out.push({
			agent: String(agent ?? "worker"),
			task: short(task ?? "", 200) || "(未描述的任务)",
			slot,
		});
	};

	if (Array.isArray(a.tasks)) {
		a.tasks.forEach((t: any, i: number) => push(t?.agent, t?.task, i));
	} else if (Array.isArray(a.chain)) {
		a.chain.forEach((t: any, i: number) => push(t?.agent, t?.task, i));
	} else if (a.agent || a.task || a.prompt || a.description) {
		push(a.agent ?? a.subagent_type, a.task ?? a.prompt ?? a.description, 0);
	}
	return out;
}
