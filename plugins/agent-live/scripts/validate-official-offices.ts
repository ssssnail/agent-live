import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponentLibrary, loadOfficialOffices } from "../src/content/library.ts";
import { validateOfficeSpec } from "../src/content/validator.ts";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(pluginRoot, "web/v2/content");
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const library = await loadComponentLibrary(contentRoot);
const offices = await loadOfficialOffices(contentRoot);

assert.deepEqual(offices.map((office) => office.id).sort(), ["builtin/boardroom-office", "builtin/old-school-office", "builtin/tech-open-office"]);
for (const office of offices) {
	const result = validateOfficeSpec(office, library);
	assert.equal(result.valid, true, `${office.id}: ${JSON.stringify(result.issues)}`);
	const shortId = office.id.replace(/^builtin\//, "");
	const preset = await readJson(path.join(contentRoot, "presets", `${shortId}.json`));
	assert.equal(preset.officeSpec, `official-offices/${shortId}.json`);
	assert.equal(`builtin/${preset.content.layout}`, office.layout);
	assert.equal(`builtin/${preset.content.style}`, office.style);
	assert.equal(`builtin/${preset.content.agentSkin}`, office.agentSkin);
	assert.equal(`builtin/${preset.content.atmosphere}-atmosphere`, office.atmosphere);
	assert.equal(`builtin/${preset.content.environment}-environment`, office.environment);
	const layout = library.layouts.get(office.layout);
	for (const placement of office.placements) {
		const slot = layout.placementSlots.find((candidate: any) => candidate.id === placement.slot);
		assert.equal(slot.occupiedBy, placement.id, `${office.id}: ${placement.id} differs from the rendered layout`);
	}
	const npcBundle = await readJson(path.join(contentRoot, "npcs", `${preset.content.npcs}.json`));
	assert.deepEqual(office.npcs.map((npc: any) => npc.id), npcBundle.entries.map((npc: any) => npc.id));
	for (const npc of office.npcs) {
		const legacy = npcBundle.entries.find((candidate: any) => candidate.id === npc.id);
		assert.deepEqual({ name: npc.name, title: npc.title, spawn: npc.spawn, appearance: npc.appearance }, { name: legacy.name, title: legacy.title, spawn: legacy.spawn, appearance: legacy.appearance });
	}
	const activityBundle = await readJson(path.join(contentRoot, "life-activities", `${preset.content.lifeActivities}.json`));
	assert.deepEqual(office.activities.map((id: string) => id.replace(/^builtin\//, "")), activityBundle.entries.map((activity: any) => activity.id));
}

console.log(`official office specs: ${offices.length} valid and aligned with runtime presets`);
