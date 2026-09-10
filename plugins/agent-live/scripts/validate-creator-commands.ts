import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponentLibrary, loadOfficialOffices } from "../src/content/library.ts";
import { OfficeRegistry } from "../src/content/registry.ts";
import { CreatorService } from "../src/creator/service.ts";
import { CreatorCommandRouter } from "../src/creator/commands.ts";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/v2/content");
const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-commands-"));
try {
	const library = await loadComponentLibrary(contentRoot);
	const registry = new OfficeRegistry({ root, library, officialOffices: await loadOfficialOffices(contentRoot) });
	const router = new CreatorCommandRouter(new CreatorService(registry, library));
	assert.equal((await router.execute({ command: "list_offices" })).ok, true);
	const components: any = await router.execute({ command: "list_components" });
	assert.equal(components.ok && components.data.layouts.some((entry: any) => entry.id === "builtin/tech-open-office"), true);
	const changed: any = await router.execute({ command: "customize", patch: { id: "local/command-office", name: "Command Office", npcs: { upsert: [{ id: "colleague" }] } } });
	assert.equal(changed.ok && changed.data.office.id === "local/command-office", true);
	assert.equal((await registry.selected()).id, "local/command-office");
	const before = await registry.selected();
	assert.equal((await router.execute({ command: "customize", patch: { components: { layout: "builtin/missing" } } })).ok, false);
	assert.deepEqual(await registry.selected(), before);
	for (const command of ["preview", "undo", "confirm", "discard", "create_from_preset", "apply_patch"]) assert.equal((await router.execute({ command })).ok, false, `${command} remained public`);
	assert.equal((await router.execute({ command: "list_offices", path: "/tmp" })).ok, false);
	console.log("creator commands: discovery, direct atomic customization, failure isolation and closed surface passed");
} finally { await rm(root, { recursive: true, force: true }); }
