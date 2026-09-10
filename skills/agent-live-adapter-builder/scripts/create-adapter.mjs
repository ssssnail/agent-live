#!/usr/bin/env node
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const value = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const id = value("--id");
const name = value("--name");
const output = value("--output");
if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !name || !output) throw new Error("Usage: create-adapter.mjs --id <lowercase-id> --name <name> --output <directory>");
const root = path.resolve(output);
await mkdir(root, { recursive: true });
if ((await readdir(root)).length) throw new Error(`Refusing to overwrite non-empty directory: ${root}`);
await mkdir(path.join(root, "src"));
await mkdir(path.join(root, "test"));
const className = id.replace(/(^|-)([a-z])/g, (_match, _dash, letter) => letter.toUpperCase());
const files = {
	"package.json": JSON.stringify({ name: `agent-live-adapter-${id}`, version: "0.1.0", private: true, type: "module", scripts: { test: "node --test" }, dependencies: { "agent-live": "github:ssssnail/agent-live#main" } }, null, 2) + "\n",
	"src/index.ts": `import { defineAdapter, type OfficeDelta } from "agent-live";\n\nexport interface ${className}Host {\n\tsubscribe(listener: (event: unknown) => void): () => void;\n}\n\nfunction mapHostEvent(_event: unknown): OfficeDelta | undefined {\n\t// TODO: implement only mappings supported by official host evidence.\n\treturn undefined;\n}\n\nexport default defineAdapter<${className}Host>({\n\tid: "${id}",\n\tname: ${JSON.stringify(name)},\n\tconnect({ host, office }) {\n\t\treturn host.subscribe((event) => {\n\t\t\tconst mapped = mapHostEvent(event);\n\t\t\tif (mapped) office.publish(mapped);\n\t\t});\n\t},\n});\n`,
	"test/adapter.test.ts": `import test from "node:test";\nimport assert from "node:assert/strict";\nimport adapter from "../src/index.ts";\n\ntest("adapter identity", () => {\n\tassert.equal(adapter.id, "${id}");\n});\n`,
	"HOST-CAPABILITIES.md": `# ${name} capabilities\n\nTODO: Record official sources, versions, supported and unsupported capabilities before implementation.\n`,
	"EVENT-MAPPING.md": `# ${name} event mapping\n\n| Official event | Source | Fields and IDs | Delivery | OfficeDelta | Degradation |\n| --- | --- | --- | --- | --- | --- |\n| TODO | TODO | TODO | TODO | TODO | TODO |\n`,
	"README.md": `# Agent Live adapter for ${name}\n\nDevelop against the public Agent Live Adapter SDK manual. Do not import Agent Live repository internals.\n`,
};
for (const [relative, content] of Object.entries(files)) await writeFile(path.join(root, relative), content, "utf8");
console.log(root);
