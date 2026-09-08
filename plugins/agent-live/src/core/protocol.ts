/**
 * Host-neutral wire protocol between coding-agent adapters and Agent Live renderers.
 * Kept dependency-free so both sides can share the vocabulary without a build step.
 */

export type AgentState =
	| "idle"
	| "thinking"
	| "working"
	| "waiting"
	| "talking"
	| "done"
	| "error";

/** Where the character physically goes in the office for a given piece of work. */
export type OfficeAction =
	| "type"
	| "archive"
	| "server"
	| "whiteboard"
	| "phone"
	| "delegate"
	| "coffee";

export interface AgentView {
	id: string;
	name: string;
	role: string;
	/** Parent agent id for delegated workers. */
	parent?: string;
	state: AgentState;
	/** Short human label of what it is doing right now. */
	detail?: string;
	action?: OfficeAction;
	task?: string;
	thought?: string;
	model?: string;
	tokens: number;
	cost: number;
	toolCalls: number;
	joinedAt: number;
	seat?: number;
}

export interface LogItem {
	at: number;
	agentId: string;
	kind: "thought" | "say" | "tool" | "delegate" | "join" | "leave" | "system";
	text: string;
}

export interface SessionInfo {
	cwd: string;
	model?: string;
	thinkingLevel?: string;
	busy: boolean;
	turns: number;
	startedAt: number;
}

export type OfficeEvent =
	| { type: "snapshot"; agents: AgentView[]; log: LogItem[]; session: SessionInfo }
	| { type: "session"; session: SessionInfo }
	| { type: "agent_join"; agent: AgentView }
	| { type: "agent_leave"; id: string; ok: boolean }
	| { type: "agent_state"; id: string; state: AgentState; detail?: string }
	| { type: "task"; id: string; task: string }
	| { type: "thought"; id: string; text: string }
	| { type: "say"; id: string; text: string }
	| {
			type: "action";
			id: string;
			action: OfficeAction;
			label: string;
			toolCallId: string;
	  }
	| { type: "action_end"; id: string; toolCallId: string; ok: boolean }
	| { type: "delegate"; from: string; to: string; task: string }
	| { type: "usage"; id: string; tokens: number; cost: number }
	| { type: "log"; item: LogItem };
