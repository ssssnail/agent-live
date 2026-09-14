import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.AGENT_LIVE_PI_PORT = "0";
process.env.AGENT_LIVE_VIEWER_CLOSE_GRACE_MS = "10";
const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-pi-lifecycle-"));
process.env.AGENT_LIVE_DATA_DIR = path.join(root, "data");
const { default: installPiAdapter } = await import("../../../packages/pi/src/adapter.ts");

const handlers = new Map<string, (event: unknown, ctx: any) => Promise<unknown>>();
const commands = new Map<string, { handler(args: string, ctx: any): Promise<void> }>();
const notices: string[] = [];
const pi = {
	on(name: string, handler: any) { handlers.set(name, handler); },
	registerCommand(name: string, command: any) { commands.set(name, command); },
	registerTool() {},
};
const ctx = {
	cwd: process.cwd(),
	model: { id: "test-model" },
	thinkingLevel: "minimal",
	hasUI: true,
	ui: { setStatus() {}, notify(message: string) { notices.push(message); } },
};

const currentUrl = () => {
	const match = notices.at(-1)?.match(/http:\/\/localhost:\d+\/v2\.html\?[^\s)]+/);
	assert(match, `missing Agent Live URL in ${notices.at(-1)}`);
	return match[0];
};

const authenticatedEndpoint = (viewerUrl: string, pathname: string) => {
	const viewer = new URL(viewerUrl);
	const endpoint = new URL(pathname, viewer.origin);
	endpoint.searchParams.set("token", viewer.searchParams.get("token") ?? "");
	return endpoint;
};

try {
	installPiAdapter(pi as any);
	await handlers.get("session_start")?.({}, ctx);
	await commands.get("agent-live")?.handler("status", ctx);
	const firstUrl = currentUrl();
	await commands.get("agent-live")?.handler("custom", ctx);
	await handlers.get("message_end")?.({ message: { role: "assistant", content: [], usage: { totalTokens: 900, cost: { total: 1 } } } }, ctx);
	await new Promise<void>((resolve, reject) => {
		const request = http.get(authenticatedEndpoint(firstUrl, "/events"), (response) => {
			response.once("data", () => {
				response.destroy();
				request.destroy();
				resolve();
			});
		});
		request.once("error", reject);
	});
	await new Promise((resolve) => setTimeout(resolve, 250));
	await assert.rejects(fetch(authenticatedEndpoint(firstUrl, "/api/state")), "Pi Runtime remained reachable after its last Viewer closed");

	await commands.get("agent-live")?.handler("status", ctx);
	const reopenedUrl = currentUrl();
	assert.equal((await fetch(authenticatedEndpoint(reopenedUrl, "/api/state"))).ok, true, "Pi Runtime could not restart after Viewer-driven shutdown");
	const snapshot = await (await fetch(authenticatedEndpoint(reopenedUrl, "/api/state"))).json();
	assert.equal(snapshot.agents[0].tokens, 900, "Viewer restart must retain session usage");
	assert.equal(await handlers.get("before_agent_start")?.({ prompt: "fix login", systemPrompt: "normal" }, ctx), undefined, "Viewer shutdown must exit Creator Mode");
	await commands.get("agent-live")?.handler("custom", ctx);
	await commands.get("agent-live")?.handler("close", ctx);
	await handlers.get("message_end")?.({ message: { role: "assistant", content: [], usage: { totalTokens: 100, cost: { total: 0 } } } }, ctx);
	await commands.get("agent-live")?.handler("status", ctx);
	const last = await (await fetch(authenticatedEndpoint(currentUrl(), "/api/state"))).json();
	assert.equal(last.agents[0].tokens, 1000, "usage must include work while the viewer was closed");
	assert.equal(await handlers.get("before_agent_start")?.({ prompt: "fix login", systemPrompt: "normal" }, ctx), undefined);
	await handlers.get("session_shutdown")?.({}, ctx);
	const restoredCtx = { ...ctx, sessionManager: { getBranch: () => [
		{ message: { role: "user", content: "hello" } },
		{ message: { role: "assistant", usage: { totalTokens: 300, cost: { total: 0.5 } } } },
		{ message: { role: "assistant", usage: { totalTokens: 400, cost: { total: 0.5 } } } },
	] } };
	await handlers.get("session_start")?.({}, restoredCtx);
	await commands.get("agent-live")?.handler("status", restoredCtx);
	const restored = await (await fetch(authenticatedEndpoint(currentUrl(), "/api/state"))).json();
	assert.equal(restored.agents[0].tokens, 700, "an existing host session must recover its own usage, not the previous session's counters");
	console.log("pi lifecycle: last Viewer closes the instance and /agent-live can restart it");
} finally {
	await handlers.get("session_shutdown")?.({}, ctx);
	await rm(root, { recursive: true, force: true });
}
