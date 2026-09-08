#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { CodexAppServerClient } from "../src/adapters/codex/app-server-client.ts";
import { CodexOfficeSession, type PendingApproval } from "../src/adapters/codex/adapter.ts";
import { AgentLiveRuntime } from "../src/runtime/agent-live-runtime.ts";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] ?? fallback : fallback;
};
const port = Number(option("--port", process.env.AGENT_LIVE_CODEX_PORT ?? "7792"));
const preset = option("--preset", "tech-open-office");
const cwd = option("--cwd", process.cwd());
const shouldOpen = args.includes("--open");
const viewerStartTimeoutMs = Number(process.env.AGENT_LIVE_VIEWER_START_TIMEOUT_MS ?? "60000");
const viewerCloseGraceMs = Number(process.env.AGENT_LIVE_VIEWER_CLOSE_GRACE_MS ?? "12000");

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid --port");
if (!Number.isFinite(viewerStartTimeoutMs) || viewerStartTimeoutMs < 100) throw new Error("Invalid viewer start timeout");
if (!Number.isFinite(viewerCloseGraceMs) || viewerCloseGraceMs < 0) throw new Error("Invalid viewer close grace");

const token = randomBytes(24).toString("hex");
const runtime = new AgentLiveRuntime(cwd);
const state = runtime.state;
const appServer = new CodexAppServerClient({ cwd });
let approval: PendingApproval | null = null;
let viewerCloseTimer: ReturnType<typeof setTimeout> | null = null;
let viewerStartTimer: ReturnType<typeof setTimeout> | null = null;
let hasSeenViewer = false;
let closing = false;
const session = new CodexOfficeSession(state, appServer, {
	cwd,
	onApproval(value) {
		approval = value;
	},
});

await session.start();
const server = await runtime.start({
	port,
	onViewerCountChange(count) {
		if (count > 0) {
			hasSeenViewer = true;
			if (viewerStartTimer) clearTimeout(viewerStartTimer);
			viewerStartTimer = null;
			if (viewerCloseTimer) clearTimeout(viewerCloseTimer);
			viewerCloseTimer = null;
			return;
		}
		if (!hasSeenViewer || closing || viewerCloseTimer) return;
		viewerCloseTimer = setTimeout(() => void close(true), viewerCloseGraceMs);
		viewerCloseTimer.unref?.();
	},
	controls: {
		token,
		status: () => ({ ...session.getStatus(), approval }),
		selectModel(model) {
			session.selectModel(model);
			return { ok: true, model };
		},
		prompt: (text, model) => session.prompt(text, model),
		interrupt: () => session.interrupt(),
		resolveApproval(id, allow, forSession) {
			session.resolveApproval(id, allow, forSession);
			approval = null;
			return { ok: true };
		},
	},
});
viewerStartTimer = setTimeout(() => {
	if (!hasSeenViewer) void close(true);
}, viewerStartTimeoutMs);
viewerStartTimer.unref?.();

const query = new URLSearchParams({ client: "codex", preset, token });
const url = `${server.url}/v2.html?${query}`;
if (shouldOpen) server.open(`v2.html?${query}`);
console.log(url);

async function close(exitAfter = false) {
	if (closing) return;
	closing = true;
	if (viewerCloseTimer) clearTimeout(viewerCloseTimer);
	if (viewerStartTimer) clearTimeout(viewerStartTimer);
	await session.close();
	await runtime.close();
	if (exitAfter) process.exit(0);
}
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));

// Keep the lightweight client alive between turns; no daemon or shared runtime.
await new Promise(() => {});
