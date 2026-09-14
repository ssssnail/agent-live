#!/usr/bin/env node
/**
 * Regression guard for Runtime shutdown.
 *
 * `start()` awaits the content service and the HTTP listener. A host that closes
 * the runtime while that is still in flight used to end up with a listening
 * server the resource guard never owned: the viewer stayed reachable after
 * shutdown and every later close was a no-op.
 */
import assert from "node:assert/strict";
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AgentLiveRuntime } from "../src/runtime/agent-live-runtime.ts";

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
	const probe = net.createServer();
	probe.once("error", reject);
	probe.listen(0, "127.0.0.1", () => {
		const address = probe.address();
		probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
	});
});

const reachable = async (port: number): Promise<boolean> => new Promise((resolve) => {
	const socket = net.connect({ port, host: "127.0.0.1" });
	const settle = (value: boolean) => {
		socket.removeAllListeners();
		socket.destroy();
		resolve(value);
	};
	socket.once("connect", () => settle(true));
	socket.once("error", () => settle(false));
});

const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-runtime-lifecycle-"));
try {
	const runtime = new AgentLiveRuntime(root, { dataRoot: root });
	const server = await runtime.start({ port: await freePort() });
	assert.equal((await fetch(`${server.url}/api/scene-limits`)).ok, true, "a started runtime must serve the viewer");
	assert.equal(await runtime.start({ port: server.port }), server, "start() must be idempotent");
	await runtime.close();
	assert.equal(await reachable(server.port), false, "close() must stop the HTTP service");

	const port = await freePort();
	const raced = new AgentLiveRuntime(root, { dataRoot: root });
	const starting = raced.start({ port });
	await raced.close();
	await assert.rejects(starting, /closed/, "start() must fail when the runtime closed while it was starting");
	assert.equal(await reachable(port), false, "a runtime closed during startup must not leave a listening service behind");
	await assert.rejects(raced.start({ port }), /closed/, "a closed runtime must stay closed");

	console.log("Runtime lifecycle: close() stops the service, even when it wins against start()");
} finally {
	await rm(root, { recursive: true, force: true });
}
