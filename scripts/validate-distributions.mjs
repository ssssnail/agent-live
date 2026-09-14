import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const isFile = async (file) => stat(file).then((value) => value.isFile(), () => false);

const core = await json(path.join(root, "package.json"));
const pi = await json(path.join(root, "packages/pi/package.json"));
const dsh = await json(path.join(root, "plugins/agent-live/dsh/package.json"));
const marketplace = await json(path.join(root, ".agents/plugins/marketplace.json"));

assert.equal(core.name, "@iniesta8888/agent-live");
assert.equal(pi.name, "@iniesta8888/agent-live-pi-adapter");
assert.equal(dsh.name, "@iniesta8888/agent-live-dsh-adapter");
assert.equal(pi.version, core.version);
assert.equal(dsh.version, core.version);
assert.ok(pi.keywords.includes("pi-package"), "Pi package must remain discoverable by the Pi catalog");
assert.ok(dsh.keywords.includes("dsh-plugin"), "DSH package must carry directory discovery metadata");
assert.equal(dsh.repository?.directory, "plugins/agent-live/dsh");
assert.equal(core.pi, undefined, "core package must not register itself as a Pi extension");
assert.equal(core.exports?.["./pi"], undefined, "core package must not expose the Pi adapter");
assert.ok(!core.files.some((entry) => entry === "plugins/agent-live" || entry === "pi.ts"), "core tarball must not include host packages");

for (const file of [
	"packages/pi/dist/adapter.js",
	"packages/pi/web/v2.html",
	"dist/codex-plugin/.codex-plugin/plugin.json",
	"dist/codex-plugin/skills/agent-live/SKILL.md",
	"dist/codex-plugin/scripts/codex-client.js",
	"dist/codex-plugin/scripts/creator-command.js",
	"dist/codex-plugin/web/v2.html",
	"plugins/agent-live/dsh/lib/index.js",
	"plugins/agent-live/dsh/lib/client.js",
]) assert.equal(await isFile(path.join(root, file)), true, `missing distribution file ${file}`);

assert.equal(marketplace.plugins[0].source.path, "./dist/codex-plugin");
const codexSkill = await readFile(path.join(root, "dist/codex-plugin/skills/agent-live/SKILL.md"), "utf8");
assert.match(codexSkill, /scripts\/codex-client\.js/);
assert.doesNotMatch(codexSkill, /scripts\/codex-client\.ts/);
const piBundle = await readFile(path.join(root, "packages/pi/dist/adapter.js"), "utf8");
assert.doesNotMatch(piBundle, /CodexAppServerClient|DshSnapshotAdapter/);

console.log("distribution contract: core, Pi, Codex and DSH artifacts are isolated");
