import { cp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
await rm(path.join(root, "dist"), { recursive: true, force: true });
await new Promise((resolve, reject) => {
	const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["tsc", "-p", "tsconfig.build.json"], { cwd: root, stdio: "inherit" });
	child.once("error", reject);
	child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`TypeScript build exited with ${code}`)));
});
await cp(path.join(root, "plugins/agent-live/web"), path.join(root, "dist/web"), { recursive: true });
