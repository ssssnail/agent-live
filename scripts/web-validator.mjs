import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Generates the browser copy of the shared content rules.
 *
 * `plugins/agent-live/src/content/graph-validator.ts` is the single source; the
 * browser cannot import TypeScript, so this script compiles that one file into
 * `plugins/agent-live/web/v2/graph-validator.js` (plus its declaration file).
 * `--check` compiles into a temporary directory instead and fails when the
 * committed copy drifted, so CI catches a forgotten regeneration.
 */
const root = path.resolve(import.meta.dirname, "..");
const targetDir = path.join(root, "plugins/agent-live/web/v2");
const project = path.join(root, "tsconfig.web-validator.json");
const generated = ["graph-validator.js", "graph-validator.d.ts"];
const check = process.argv.includes("--check");

async function compile(outDir) {
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", project, "--outDir", outDir], { cwd: root, stdio: "inherit" });
		child.once("error", reject);
		child.once("exit", (code) => (code === 0 ? resolve(undefined) : reject(new Error(`tsc exited with ${code}`))));
	});
}

if (!check) {
	await compile(targetDir);
	console.log(`web content validator: wrote ${generated.join(", ")}`);
} else {
	const scratch = await mkdtemp(path.join(os.tmpdir(), "agent-live-web-validator-"));
	try {
		await compile(scratch);
		const drifted = [];
		for (const file of generated) {
			const [expected, actual] = await Promise.all([
				readFile(path.join(scratch, file), "utf8"),
				readFile(path.join(targetDir, file), "utf8").catch(() => null),
			]);
			if (expected !== actual) drifted.push(file);
		}
		if (drifted.length) throw new Error(`web content validator is stale (${drifted.join(", ")}); run "npm run build:validator"`);
		console.log(`web content validator: ${generated.length} generated files match the shared source`);
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
}
