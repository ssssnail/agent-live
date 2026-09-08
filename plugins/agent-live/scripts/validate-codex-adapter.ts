import { CodexOfficeSession } from "../src/adapters/codex/adapter.ts";
import { OfficeState } from "../src/core/state.ts";

const state = new OfficeState("/tmp/agent-live-codex-adapter-test");
state.join("main", { name: "Cody", role: "codex" });
state.updateSession({ busy: true });
const client = {
	request: async () => ({}),
	onMessage: () => () => {},
	start: async () => ({}),
	close: async () => {},
	respond() {},
	respondError() {},
};
const session = new CodexOfficeSession(state, client as never, { cwd: process.cwd() });
const handle = (message: unknown) => (session as any).handleMessage(message);

handle({
	method: "item/completed",
	params: {
		threadId: "root",
		item: {
			type: "collabAgentToolCall",
			id: "spawn-1",
			tool: "spawnAgent",
			status: "completed",
			senderThreadId: "root",
			receiverThreadIds: ["child-1"],
			prompt: "inspect",
		},
	},
});
let child = state.getAgent("codex:child-1");
if (!child || child.seat !== 1 || child.name !== "Teammate") throw new Error("Codex receiverThreadIds mapping failed");
if (state.getAgent("main")?.state !== "waiting") throw new Error("Codex main agent should wait for its child");

handle({
	method: "item/completed",
	params: {
		threadId: "root",
		item: {
			type: "subAgentActivity",
			id: "activity-1",
			kind: "started",
			agentThreadId: "child-1",
			agentPath: "/root/visual_check",
		},
	},
});
child = state.getAgent("codex:child-1");
if (!child || child.name !== "visual_check" || child.parent !== "main") {
	throw new Error("Codex subAgentActivity identity mapping failed");
}

handle({ method: "item/completed", params: { threadId: "child-1", item: { type: "agentMessage", id: "msg-1", text: "report" } } });
if (state.getAgent("main")?.state !== "waiting") throw new Error("Child activity replaced the main agent state");
await session.close();

console.log("Codex adapter validation passed: host schema maps to shared agent lifecycle");
