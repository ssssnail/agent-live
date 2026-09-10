import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileOfficePatch } from "../src/content/compiler.ts";
import { loadComponentLibrary, loadOfficialOffices } from "../src/content/library.ts";
import { OfficeRegistry } from "../src/content/registry.ts";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/v2/content");
const library = await loadComponentLibrary(contentRoot);
const official = await loadOfficialOffices(contentRoot);
const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-registry-"));
try {
	const registry = new OfficeRegistry({ root, library, officialOffices: official });
	assert.equal((await registry.selected()).id, "builtin/tech-open-office");
	const base = official.find((office) => office.id === "builtin/tech-open-office")!;
	const compiled = compileOfficePatch(base, { schemaVersion: 1, kind: "office-patch", base: base.id, id: "local/my-office", name: "My Office", npcs: { upsert: [{ id: "new-colleague" }] } }, library);
	assert.ok(compiled.draft);
	let changed = "";
	const unsubscribe = registry.onChange((id) => { changed = id ?? ""; });
	assert.equal((await registry.save(compiled.draft)).saved, true);
	const nested = { ...structuredClone(compiled.draft), id: "local/a/b", name: "Nested" };
	const dashed = { ...structuredClone(compiled.draft), id: "local/a--b", name: "Dashed" };
	assert.equal((await registry.save(nested)).saved, true);
	assert.equal((await registry.save(dashed)).saved, true);
	assert.equal((await registry.get("local/a/b"))?.name, "Nested", "nested id collided with dashed id");
	assert.equal((await registry.get("local/a--b"))?.name, "Dashed", "dashed id collided with nested id");
	changed = "local/my-office";
	assert.equal(changed, "local/my-office");
	await registry.select("local/my-office");
	assert.equal((await registry.selected()).npcs.some((npc) => npc.id === "new-colleague"), true);
	const before = await readFile(path.join(root, "offices/my-office.json"), "utf8");
	const invalid = structuredClone(compiled.draft) as any;
	invalid.layout = "builtin/not-real";
	assert.equal((await registry.save(invalid)).saved, false);
	assert.equal(await readFile(path.join(root, "offices/my-office.json"), "utf8"), before, "invalid save replaced the last valid office");
	await writeFile(path.join(root, "offices/broken.json"), "{not json", "utf8");
	assert.equal((await registry.list()).some((entry) => entry.id === "local/broken"), false);
	assert.equal(await registry.remove("builtin/tech-open-office"), false, "official office was removable");
	assert.equal(await registry.remove("local/my-office"), true);
	assert.equal(await registry.selectedId(), "builtin/tech-open-office");
	unsubscribe();
	console.log("office registry: atomic save, selection, fallback, invalid-file isolation and change events passed");
} finally {
	await rm(root, { recursive: true, force: true });
}
