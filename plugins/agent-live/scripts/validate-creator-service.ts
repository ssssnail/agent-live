import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
	assert.deepEqual((await creator.listOffices()).map((office) => office.name), ["tech", "meetingroom", "oldschool"]);
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
	const withText = await creator.customize({ texts: { company: "Snail Lab", notice: "Build together" }, placements: { upsert: [{ id: "extra-plant", component: "builtin/plant", slot: "extra-1" }] } });
	assert.equal(withText.saved, true);
	assert.equal(withText.office?.texts?.company, "Snail Lab");
	const summary = await creator.listComponents();
	// The catalog shape depends on the requested category, so narrow before reading.
	assert.ok("office" in summary && summary.office, "the default catalog view must carry the editable Office state");
	assert.equal(summary.office.id, "local/boardroom-office");
	assert.equal(summary.office.texts.company, "Snail Lab");
	assert.equal(summary.office.npcs.some((npc: any) => npc.id === "boardroom-boss" && npc.template === "builtin/boss"), true);
	const room = (await creator.listComponents("room")).room!;
	assert.equal(room.slots.find((slot: any) => slot.id === "extra-1")?.occupiedBy, "extra-plant");
	assert.equal((await creator.customize({ texts: { missing: "Hello" } })).saved, false);
	assert.equal((await creator.customize({ texts: { company: "x".repeat(25) } })).saved, false);
	assert.equal((await creator.customize({ texts: { company: "" } })).saved, true);
	assert.equal((await creator.customize({ texts: { slogan: "Welcome" } })).office?.texts?.notice, "Build together");
	const reopened = new OfficeRegistry({ root, library, officialOffices: await loadOfficialOffices(contentRoot) });
	assert.equal((await reopened.selected()).texts?.slogan, "Welcome", "custom text must survive a new instance");
	assert.deepEqual((await reopened.list()).slice(0, 3).map((office) => office.name), ["tech", "meetingroom", "oldschool"]);

	// A patch may name the Office it creates, but it must never overwrite another
	// Office: the model cannot see which Office it would destroy.
	const neighbour = await creator.customize({ id: "local/neighbour", name: "Neighbour" }, "builtin/tech-open-office");
	assert.equal(neighbour.saved, true);
	assert.equal((await registry.get("local/neighbour"))?.name, "Neighbour");
	const selectionBefore = (await registry.selected()).id;
	const clobber = await creator.customize({ id: "local/neighbour", name: "Hijacked", texts: { company: "taken" } }, "builtin/boardroom-office");
	assert.equal(clobber.saved, false, "a patch must not overwrite a different existing Office");
	assert.equal(clobber.errors?.some((issue) => issue.path === "$.id"), true, "the rejection must name the id that would be overwritten");
	assert.equal((await registry.get("local/neighbour"))?.name, "Neighbour", "the existing Office must stay untouched");
	assert.equal((await registry.get("local/neighbour"))?.texts?.company, undefined, "the existing Office must keep its own text areas");
	assert.equal((await registry.selected()).id, selectionBefore, "a rejected change must not move the selection");
	// Editing the Office a Preset already owns stays the normal path.
	const ownCopy = await creator.customize({ texts: { company: "Snail Lab" } }, "builtin/boardroom-office");
	assert.equal(ownCopy.saved, true, "the single editable copy of a Preset Office must remain writable");
	assert.equal(ownCopy.office?.id, "local/boardroom-office");

	// A Preset's standard local id belongs to that Preset's copy. Another Preset
	// must not be able to occupy it while it is still free, and the rightful Preset
	// must still be able to claim it afterwards.
	assert.equal(await registry.get("local/tech-open-office"), undefined);
	const occupied = await creator.customize({ id: "local/tech-open-office", name: "Occupied" }, "builtin/old-school-office");
	assert.equal(occupied.saved, false, "another Preset's standard local id must not be occupiable");
	assert.equal(occupied.errors?.some((issue) => issue.path === "$.id" && issue.code === "reserved-office-id"), true, "the rejection must name why the id is reserved");
	assert.equal(await registry.get("local/tech-open-office"), undefined, "a rejected patch must not claim the reserved id");
	const rightful = await creator.customize({ name: "Tech copy" }, "builtin/tech-open-office");
	assert.equal(rightful.saved, true, "the Preset that owns the id must still be able to claim it");
	assert.equal(rightful.office?.id, "local/tech-open-office");

	// An Office that already sits on this Preset's local id but descends from a
	// different Preset must not be overwritten silently: the id says "tech", the
	// Office says "boardroom".
	const occupantPath = path.join(root, "offices", "tech-open-office.json");
	const stored = JSON.parse(await readFile(occupantPath, "utf8"));
	assert.equal(stored.basePreset, "builtin/tech-open-office");
	await writeFile(occupantPath, `${JSON.stringify({ ...stored, name: "Boardroom squatter", basePreset: "builtin/boardroom-office" }, null, "\t")}\n`);
	const blocked = await creator.customize({ texts: { company: "taken" } }, "builtin/tech-open-office");
	assert.equal(blocked.saved, false, "an Office from another Preset must not be overwritten through this Preset's id");
	assert.equal(blocked.errors?.some((issue) => issue.path === "$.id" && issue.code === "id-conflict"), true, "the rejection must point at the id");
	assert.equal((await registry.get("local/tech-open-office"))?.name, "Boardroom squatter", "the occupying Office must stay untouched");
	assert.equal((await registry.get("local/tech-open-office"))?.basePreset, "builtin/boardroom-office", "the occupying Office must keep its own Preset");
	console.log("creator service: direct save/select, full-content Office copies, defaults and failed-change isolation passed");
} finally { await rm(root, { recursive: true, force: true }); }
