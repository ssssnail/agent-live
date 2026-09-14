import { CodexOfficeSession } from "../src/adapters/codex/adapter.ts";
import { OfficeState } from "../src/core/state.ts";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { CodexAppServerClient } from "../src/adapters/codex/app-server-client.ts";

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
state.dispose();

// A child turn may start before Codex reports its collaboration identity. It
// must never replace the main turn id used by the Stop control.
const interruptState = new OfficeState("/tmp/agent-live-interrupt-test");
interruptState.join("main", { name: "Cody", role: "codex" });
interruptState.updateSession({ busy: true });
const interruptRequests: Array<{ method: string; params: unknown }> = [];
const interruptClient = {
	...client,
	request: async (method: string, params: unknown) => {
		interruptRequests.push({ method, params });
		return {};
	},
};
const interruptSession = new CodexOfficeSession(interruptState, interruptClient as never, { cwd: process.cwd() });
(interruptSession as any).threadId = "main-thread";
(interruptSession as any).turnId = "main-turn";
(interruptSession as any).handleMessage({ method: "turn/started", params: { threadId: "unknown-child", turn: { id: "child-turn" } } });
assert.equal((interruptSession as any).turnId, "main-turn", "unknown child turn replaced the main turn id");
await interruptSession.interrupt();
assert.deepEqual(interruptRequests, [
	{ method: "turn/interrupt", params: { threadId: "main-thread", turnId: "main-turn" } },
	{ method: "turn/interrupt", params: { threadId: "unknown-child", turnId: "child-turn" } },
]);
(interruptSession as any).handleMessage({
	method: "item/completed",
	params: { threadId: "main-thread", item: { type: "subAgentActivity", id: "root-activity", kind: "started", agentThreadId: "main-thread", agentPath: "/root" } },
});
assert.equal(interruptState.getAgent("codex:main-thread"), undefined, "root activity was rendered as a child agent");
await interruptSession.close();
interruptState.dispose();

// Approval UI reads the actual queue, not a second last-seen copy.
const approvalState = new OfficeState("/tmp/agent-live-approval-test");
approvalState.join("main", { name: "Cody", role: "codex" });
const decisions: unknown[] = [];
const approvalSession = new CodexOfficeSession(approvalState, { ...client, respond: (...args: unknown[]) => decisions.push(args) } as never, { cwd: process.cwd() });
mock.timers.enable({ apis: ["setTimeout"] });
try {
	const requestApproval = (id: number) => (approvalSession as any).handleMessage({ id, method: "item/commandExecution/requestApproval", params: { command: `test-${id}` } });
	requestApproval(1);
	requestApproval(1);
	requestApproval(2);
	assert.equal(approvalSession.getStatus().approval?.id, 1);
	approvalSession.resolveApproval(1, true);
	assert.equal(approvalSession.getStatus().approval?.id, 2);
	assert.equal(approvalState.getAgent("main")?.state, "waiting");
	approvalSession.resolveApproval(2, false);
	assert.equal(approvalSession.getStatus().approval, null);
	requestApproval(3);
	(approvalSession as any).handleMessage({ method: "turn/completed", params: { turn: { status: "interrupted" } } });
	assert.equal(approvalSession.getStatus().approval, null);
	requestApproval(4);
	mock.timers.tick(120_001);
	assert.equal(approvalSession.getStatus().approval, null);
	assert.deepEqual(decisions.at(-1), [4, { decision: "decline" }]);
} finally {
	await approvalSession.close();
	approvalState.dispose();
	mock.timers.reset();
}

// Real stdio transport, simulated server: no installed Codex, login or model.
const fakeServer = `const rl=require('node:readline').createInterface({input:process.stdin});
rl.on('line',line=>{const m=JSON.parse(line);if(m.id===undefined)return;let result={};
if(m.method==='model/list')result={data:[{id:'test',model:'test',isDefault:true}]};
if(m.method==='thread/start')result={thread:{id:'test-thread',model:'test'}};
if(m.method==='turn/start')result={turn:{id:'test-turn'}};
process.stdout.write(JSON.stringify({id:m.id,result})+'\\n');
if(m.method==='turn/start')setTimeout(()=>process.exit(1),40);});`;
const crashClient = new CodexAppServerClient({ command: process.execPath, args: ["-e", fakeServer] });
const crashState = new OfficeState("/tmp/agent-live-crash-test");
const crashSession = new CodexOfficeSession(crashState, crashClient, { cwd: process.cwd() });
let failureTimer: ReturnType<typeof setTimeout> | undefined;
const disconnected = new Promise<void>((resolve, reject) => {
	failureTimer = setTimeout(() => reject(new Error("simulated server did not exit")), 5000);
	crashClient.onDisconnect(() => resolve());
});
try {
	await crashSession.start();
	await crashSession.prompt("simulated work only");
	await disconnected;
	assert.equal(crashSession.getStatus().busy, false);
	assert.match(crashSession.getStatus().error ?? "", /exited/);
	assert.equal(crashState.getAgent("main")?.state, "error");
	assert.equal(crashSession.getStatus().approval, null);
	await assert.rejects(crashSession.prompt("another task"), /exited/);
} finally {
	clearTimeout(failureTimer);
	await crashSession.close();
	crashState.dispose();
}

console.log("Codex adapter validation passed: mapping, approval queue/timeout and stdio crash recovery");
