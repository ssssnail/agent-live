import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.AGENT_LIVE_PI_PORT = "0";
const { default: installPiAdapter } = await import("../src/adapters/pi/adapter.ts");
const handlers = new Map<string, (event: any, ctx: any) => Promise<any>>();
const commands = new Map<string, any>();
const tools = new Map<string, any>();
const notices: string[] = [];
const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-pi-creator-"));
process.env.AGENT_LIVE_DATA_DIR = path.join(root, "data");
const ctx = { cwd: root, model: { id: "test-model" }, thinkingLevel: "minimal", hasUI: true, ui: { setStatus() {}, notify(message: string) { notices.push(message); } } };
const pi = { on(name: string, handler: any) { handlers.set(name, handler); }, registerCommand(name: string, definition: any) { commands.set(name, definition); }, registerTool(definition: any) { tools.set(definition.name, definition); } };
try {
	installPiAdapter(pi as any);
	await handlers.get("session_start")?.({}, ctx);
	const tool = tools.get("agent_live_creator");
	assert.ok(tool);
	assert.deepEqual(tool.parameters.properties.command.enum, ["list_offices", "list_components", "customize"]);
	const changed = JSON.parse((await tool.execute("1", { command: "customize", patch: { id: "local/pi-test", name: "Pi Test" } }, undefined, undefined, ctx)).content[0].text);
	assert.equal(changed.ok && changed.data.office.id === "local/pi-test", true);
	assert.equal("previewUrl" in changed || "creatorMode" in changed, false);
	const prompt = await handlers.get("before_agent_start")?.({ prompt: "normal work", systemPrompt: "base" }, ctx);
	assert.equal(prompt?.systemPrompt, undefined, "customization installed modal prompt state");
	await commands.get("agent-live").handler("custom", ctx);
	assert.match(notices.at(-1) ?? "", /Creator Mode 已开启/);
	const creatorPrompt = await handlers.get("before_agent_start")?.({ prompt: "add a plant", systemPrompt: "base" }, ctx);
	assert.match(creatorPrompt?.systemPrompt ?? "", /Creator Mode is active/);
	await commands.get("agent-live").handler("exit", ctx);
	assert.match(notices.at(-1) ?? "", /Creator Mode 已退出/);
	const normalPrompt = await handlers.get("before_agent_start")?.({ prompt: "normal work", systemPrompt: "base" }, ctx);
	assert.equal(normalPrompt?.systemPrompt, undefined);
	console.log("pi creator: explicit mode, scoped prompt and direct atomic customization passed");
} finally { await handlers.get("session_shutdown")?.({}, ctx); await rm(root, { recursive: true, force: true }); }
