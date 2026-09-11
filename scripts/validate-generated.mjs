import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Committed build outputs must match a fresh build.
 *
 * The browser copy of the shared content rules compares its own content
 * (`scripts/web-validator.mjs`). The DSH plugin bundle is a committed artifact as
 * well, so rebuilding it must leave the tree untouched. Run this after the DSH
 * build step; a diff means someone changed a source without rebuilding it.
 */
const root = path.resolve(import.meta.dirname, "..");
const paths = ["plugins/agent-live/dsh/lib"];
const status = execFileSync("git", ["status", "--porcelain", "--", ...paths], { cwd: root, encoding: "utf8" }).trim();

if (status) {
	console.error(`generated output is stale; rebuild and commit it:\n${status}`);
	process.exit(1);
}
console.log(`generated output: ${paths.join(", ")} matches the committed build`);
