import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pluginSource = path.join(root, "plugins/agent-live");
const dist = path.join(root, "dist");

async function bundle(entryPoint, outfile, options = {}) {
	await mkdir(path.dirname(outfile), { recursive: true });
	await build({
		entryPoints: [entryPoint],
		outfile,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		sourcemap: false,
		...options,
	});
}

// Pi gets its own npm artifact. It includes the Pi entry and the shared
// runtime/viewer it needs, but no Codex or DSH implementation.
const piDist = path.join(root, "packages/pi/dist");
await rm(piDist, { recursive: true, force: true });
await rm(path.join(root, "packages/pi/web"), { recursive: true, force: true });
await bundle(
	path.join(root, "packages/pi/src/adapter.ts"),
	path.join(piDist, "adapter.js"),
	{ external: ["@earendil-works/pi-coding-agent"] },
);
await cp(path.join(pluginSource, "web"), path.join(root, "packages/pi/web"), { recursive: true });
await rm(path.join(root, "packages/pi/web/v2/codex-controls.js"), { force: true });

// Codex Marketplace installs a repository directory instead of an npm package.
// Generate a narrow self-contained plugin with no Pi or DSH source.
const codexDist = path.join(dist, "codex-plugin");
await rm(codexDist, { recursive: true, force: true });
await cp(path.join(pluginSource, ".codex-plugin"), path.join(codexDist, ".codex-plugin"), { recursive: true });
await cp(path.join(pluginSource, "skills"), path.join(codexDist, "skills"), { recursive: true });
await cp(path.join(pluginSource, "web"), path.join(codexDist, "web"), { recursive: true });
await bundle(path.join(pluginSource, "scripts/codex-client.ts"), path.join(codexDist, "scripts/codex-client.js"));
await bundle(path.join(pluginSource, "scripts/creator-command.ts"), path.join(codexDist, "scripts/creator-command.js"));
await writeFile(path.join(codexDist, "package.json"), `${JSON.stringify({ name: "agent-live-codex-plugin", private: true, type: "module" }, null, 2)}\n`);

const skillFile = path.join(codexDist, "skills/agent-live/SKILL.md");
const skill = await readFile(skillFile, "utf8");
await writeFile(skillFile, skill
	.replaceAll("scripts/codex-client.ts", "scripts/codex-client.js")
	.replaceAll("scripts/creator-command.ts", "scripts/creator-command.js"));
