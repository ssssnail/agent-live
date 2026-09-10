import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
async function files(root: string): Promise<string[]> {
	const result: string[] = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const value = path.join(root, entry.name);
		if (entry.isDirectory()) result.push(...await files(value));
		else if (entry.name.endsWith(".ts")) result.push(value);
	}
	return result;
}
for (const file of await files(path.join(src, "core"))) {
	const source = await readFile(file, "utf8");
	assert.doesNotMatch(source, /from\s+["']\.\.\/(adapter|runtime|creator|content)/, `${file} violates Core dependency direction`);
}
for (const file of await files(path.join(src, "runtime"))) {
	const source = await readFile(file, "utf8");
	assert.doesNotMatch(source, /from\s+["']\.\.\/creator/, `${file} makes Runtime depend on Creator`);
}
for (const file of await files(path.join(src, "content"))) {
	const source = await readFile(file, "utf8");
	assert.doesNotMatch(source, /from\s+["']\.\.\/(adapter|runtime|creator)/, `${file} makes shared Content depend on an upper layer`);
}
for (const file of await files(path.join(src, "creator"))) {
	const source = await readFile(file, "utf8");
	assert.doesNotMatch(source, /from\s+["']\.\.\/(adapter|runtime)/, `${file} makes Creator depend on Adapter or Runtime`);
}
const officeEngine = await readFile(path.resolve(src, "../web/v2/office-engine.js"), "utf8");
assert.doesNotMatch(officeEngine, /\b(document|CanvasRenderingContext2D|EventSource|WebSocket)\b/, "Office Engine must stay independent of DOM drawing and transport");
const officeRenderer = await readFile(path.resolve(src, "../web/v2/office-renderer.js"), "utf8");
assert.match(officeRenderer, /from\s+["']\.\/office-engine\.js["']/, "Office Renderer must consume the shared Office Engine");
console.log("architecture dependencies: core, content, runtime and creator directions passed");
