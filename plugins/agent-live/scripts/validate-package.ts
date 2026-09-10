import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pluginRoot = path.join(root, "plugins/agent-live");
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const exists = async (file: string) => stat(file).then((value) => value.isFile(), () => false);

const pkg = await json(path.join(root, "package.json"));
const manifest = await json(path.join(pluginRoot, ".codex-plugin/plugin.json"));
const skill = await readFile(path.join(pluginRoot, "skills/agent-live/SKILL.md"), "utf8");
const appServerClient = await readFile(path.join(pluginRoot, "src/adapters/codex/app-server-client.ts"), "utf8");
const adapterScaffold = await readFile(path.join(root, "skills/agent-live-adapter-builder/scripts/create-adapter.mjs"), "utf8");

assert.equal(pkg.name, "agent-live");
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(manifest.name, "agent-live");
assert.equal(manifest.version, pkg.version, "Codex manifest version differs from package version");
assert.match(appServerClient, new RegExp(`version: ["']${pkg.version.replaceAll(".", "\\.")}["']`), "Codex App Server client version differs from package version");
assert.ok(pkg.files.includes("!plugins/agent-live/dsh/node_modules"), "root package must exclude DSH development dependencies");
assert.equal(pkg.main, "./dist/index.js");
assert.equal(pkg.types, "./dist/index.d.ts");
assert.equal(pkg.exports["."].import, "./dist/index.js");
assert.equal(pkg.exports["./adapter-sdk"].import, "./dist/adapter-sdk/index.js");
assert.equal(pkg.scripts.prepare, "npm run build", "Git dependencies must build dist during install");
assert.equal(pkg.peerDependencies?.["@earendil-works/pi-coding-agent"], undefined, "Pi must not be required by host-neutral SDK users");
assert.ok(pkg.files.includes("skills"), "adapter builder skill must be included in the package");
assert.match(adapterScaffold, /github:ssssnail\/agent-live#main/, "adapter scaffold must use the available GitHub distribution");

for (const relative of [
	".codex-plugin/plugin.json",
	"skills/agent-live/SKILL.md",
	"scripts/codex-client.ts",
	"scripts/creator-command.ts",
	"src/adapters/dsh/adapter.ts",
	"dsh/package.json",
	"dsh/cordis.patch.yml",
	"dsh/lib/client.js",
]) assert.equal(await exists(path.join(pluginRoot, relative)), true, `missing publish file ${relative}`);

for (const relative of [
	"CONTRIBUTING.md",
	"SECURITY.md",
	"CODE_OF_CONDUCT.md",
	"docs/ADAPTER-SDK.md",
	"skills/agent-live-adapter-builder/SKILL.md",
	"skills/agent-live-adapter-builder/scripts/create-adapter.mjs",
]) assert.equal(await exists(path.join(root, relative)), true, `missing public developer file ${relative}`);

assert.match(skill, /^---\nname: agent-live\ndescription: .+\n---\n/);
const releaseTag = process.env.RELEASE_TAG;
if (releaseTag) assert.equal(releaseTag, `v${pkg.version}`, `release tag must be v${pkg.version}`);

console.log(`package contract: Agent Live ${pkg.version}, manifest, direct-customization Skill, scripts and release tag passed`);
