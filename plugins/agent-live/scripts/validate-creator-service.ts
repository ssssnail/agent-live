import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponentLibrary, loadOfficialOffices } from "../src/content/library.ts";
import { OfficeRegistry } from "../src/content/registry.ts";
import { CreatorService } from "../src/creator/service.ts";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/v2/content");
const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-creator-"));
try {
	const library = await loadComponentLibrary(contentRoot);
	const registry = new OfficeRegistry({ root, library, officialOffices: await loadOfficialOffices(contentRoot) });
	const creator = new CreatorService(registry, library);
	assert.equal((await creator.listOffices()).filter((entry) => entry.origin === "official").length, 3);
	const changed = await creator.customize({ id: "local/natural-test", name: "Natural Test", npcs: { upsert: [{ id: "sam" }] }, activities: { enable: ["builtin/phone-break"] } });
	assert.equal(changed.saved, true);
	assert.equal(changed.office?.npcs.some((npc) => npc.id === "sam" && npc.profile), true);
	assert.equal((await registry.selected()).id, "local/natural-test");
	const snapshot = await registry.selected();
	const invalid = await creator.customize({ components: { layout: "builtin/boardroom-office" } });
	assert.equal(invalid.saved, false, "an Office must not be able to swap its room");
	assert.equal(invalid.errors?.some((issue: any) => issue.path === "$.components.layout"), true, "swapping a room must be rejected with a path that explains why");
	assert.deepEqual(await registry.selected(), snapshot);
	// Editing a Preset Office is the only way to end up in another room, and the
	// copy inherits every piece of content, so it costs the same as any other edit.
	const presetOffice = await registry.get("builtin/boardroom-office");
	assert.ok(presetOffice);
	const copied = await creator.customize({ name: "My Boardroom" }, presetOffice.id);
	assert.equal(copied.saved, true);
	assert.equal(copied.office?.id, "local/boardroom-office");
	assert.equal(copied.office?.layout, presetOffice.layout, "the copy keeps the room it was edited from");
	assert.equal(copied.office?.placements.length, presetOffice.placements.length);
	assert.equal(copied.office?.npcs.length, presetOffice.npcs.length);
	assert.deepEqual([...(copied.office?.activities ?? [])].sort(), [...presetOffice.activities].sort());
	assert.equal((await registry.selected()).id, "local/boardroom-office");
	console.log("creator service: direct save/select, full-content Office copies, defaults and failed-change isolation passed");
} finally { await rm(root, { recursive: true, force: true }); }
