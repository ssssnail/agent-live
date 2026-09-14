import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createOfficeEngine } from "../web/v2/office-engine.js";

const read = async (name: string) => JSON.parse(await readFile(new URL(`../web/v2/content/layouts/${name}.json`, import.meta.url), "utf8"));

for (const name of ["tech-open-office", "boardroom-office", "old-school-office"]) {
	const layout = await read(name);
	const engine = createOfficeEngine({ layout, atmosphere: {} });
	assert.equal(engine.W, 384);
	assert.equal(engine.H, 216);
	assert.equal(engine.SEATS.length, 8);
	const seat = engine.seatAnchor(0);
	const destination = engine.path(engine.TARGETS.entry, seat).at(-1);
	assert.deepEqual({ x: destination?.x, y: destination?.y }, { x: seat.x, y: seat.y });
	assert.ok(engine.anchorFor("type", 0));
	assert.ok(engine.stationKey("type", 0));
	assert.equal(engine.isNpcOnDuty("coworker"), true);
	assert.deepEqual(engine.npcHomeTarget({ role: "colleague", spawn: "staff-entry" }, 0), engine.seatAnchor(1));
	assert.deepEqual(engine.npcHomeTarget({ role: "colleague", spawn: "staff-entry" }, 4), engine.seatAnchor(5));
	assert.deepEqual(
		engine.npcHomeTarget({ role: "boss", spawn: "boss-desk" }),
		engine.TARGETS["boss-desk"] ?? engine.TARGETS.entry,
	);
}

console.log("Office engine validation passed: navigation, stations and environment fallback for 3 official layouts");
