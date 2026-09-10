import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OfficeContentService } from "../src/runtime/content-service.ts";
import { AgentLiveRuntime } from "../src/runtime/agent-live-runtime.ts";
import { CreatorService } from "../src/creator/service.ts";
import { CreatorCommandRouter } from "../src/creator/commands.ts";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/v2/content");
const dataRoot = await mkdtemp(path.join(os.tmpdir(), "agent-live-runtime-"));
let runtime: AgentLiveRuntime | undefined;
try {
	const content = await OfficeContentService.create({ dataRoot, contentRoot });
	const router = new CreatorCommandRouter(new CreatorService(content.registry, content.library));
	runtime = new AgentLiveRuntime(process.cwd(), { dataRoot });
	const server = await runtime.start({ port: 0, host: "127.0.0.1", content, creator: router, creatorToken: "test-token" });
	assert.equal((await fetch(`${server.url}/api/state`)).status, 403);
	assert.equal((await fetch(`${server.url}/api/state`, { headers: { "x-agent-live-token": "test-token" } })).status, 200);
	assert.equal((await fetch(`${server.url}/api/state`, { headers: { origin: "http://attacker.example", "x-agent-live-token": "test-token" } })).status, 403);
	const unauthorized = await fetch(`${server.url}/api/creator`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: "list_offices" }) });
	assert.equal(unauthorized.status, 403);
	const request = { command: "customize", patch: { id: "local/browser-test", name: "Browser Test", placements: { remove: ["plant-1"] } } };
	const changed = await fetch(`${server.url}/api/creator`, { method: "POST", headers: { "content-type": "application/json", "x-agent-live-token": "test-token" }, body: JSON.stringify(request) }).then((response) => response.json());
	assert.equal(changed.ok, true);
	assert.equal((await content.registry.selected()).id, "local/browser-test");
	const graph = await fetch(`${server.url}/api/office-content?id=${encodeURIComponent("local/browser-test")}`).then((response) => response.json());
	assert.equal(graph.preset.id, "local/browser-test");
	assert.equal(graph.layout.propInstances.some((entry: any) => entry.id === "plant-1"), false);
	assert.equal((await fetch(`${server.url}/api/office-content?id=local%2Fmissing`)).status, 404);
	console.log("custom office runtime: authenticated direct customization and renderable saved content passed");
} finally { await runtime?.close(); await rm(dataRoot, { recursive: true, force: true }); }
