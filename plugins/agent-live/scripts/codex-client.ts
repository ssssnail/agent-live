#!/usr/bin/env node
import { launchCodexAdapter } from "../src/adapters/codex/launcher.ts";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] ?? fallback : fallback;
};
const port = Number(option("--port", process.env.AGENT_LIVE_CODEX_PORT ?? "7792"));
const preset = option("--preset", "tech-open-office");
const cwd = option("--cwd", process.cwd());
const viewerStartTimeoutMs = Number(process.env.AGENT_LIVE_VIEWER_START_TIMEOUT_MS ?? "180000");
const viewerCloseGraceMs = Number(process.env.AGENT_LIVE_VIEWER_CLOSE_GRACE_MS ?? "12000");

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid --port");
if (!Number.isFinite(viewerStartTimeoutMs) || viewerStartTimeoutMs < 100) throw new Error("Invalid viewer start timeout");
if (!Number.isFinite(viewerCloseGraceMs) || viewerCloseGraceMs < 0) throw new Error("Invalid viewer close grace");

const handle = await launchCodexAdapter({
	cwd,
	port,
	preset,
	sourceThreadId: process.env.CODEX_THREAD_ID,
	viewerStartTimeoutMs,
	viewerCloseGraceMs,
	open: args.includes("--open"),
	onAutoClose: () => process.exit(0),
});
console.log(handle.url);

const stop = () => void handle.close().catch((error) => {
	console.error(`Agent Live cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
}).finally(() => process.exit(0));
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

// Keep the lightweight client alive between turns; no daemon or shared runtime.
await new Promise(() => {});
