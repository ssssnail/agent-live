import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENE_LIMITS } from "../src/core/limits.ts";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(pluginRoot, "web", "v2", "content");
const layoutRoot = path.join(contentRoot, "layouts");

function read(file: string): any {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ok(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function unique(values: unknown[], label: string) {
	ok(new Set(values).size === values.length, `${label} must be unique`);
}

function inCanvas(point: any, canvas: any) {
	return Number.isFinite(point?.x) && Number.isFinite(point?.y) && point.x >= 0 && point.y >= 0 && point.x <= canvas.width && point.y <= canvas.height;
}

function pointInZone(point: any, zone: any) {
	return point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height;
}

const propLibrary = read(path.join(contentRoot, "component-library", "props.json"));
const propTypes = new Map(propLibrary.entries.map((entry: any) => [entry.renderer, entry]));
const formalLayouts = new Set(["tech-open-office.json", "boardroom-office.json", "old-school-office.json"]);
const layoutFiles = fs.readdirSync(layoutRoot).filter((name) => name.endsWith(".json")).sort();

for (const filename of layoutFiles) {
	const layout = read(path.join(layoutRoot, filename));
	const label = layout.id ?? filename;
	const canvas = layout.canvas;
	ok(canvas?.width === 384 && canvas?.height === 216, `${label} must use the single-office canvas`);
	ok(Array.isArray(layout.navigation?.lanes) && layout.navigation.lanes.length > 0, `${label} has no navigation lanes`);
	ok(Array.isArray(layout.navigation?.connectors) && layout.navigation.connectors.length > 0, `${label} has no navigation connectors`);
	ok(layout.navigation.lanes.every((value: unknown) => Number.isFinite(value) && Number(value) >= 0 && Number(value) <= canvas.height), `${label} has a lane outside the canvas`);
	ok(layout.navigation.connectors.every((value: unknown) => Number.isFinite(value) && Number(value) >= 0 && Number(value) <= canvas.width), `${label} has a connector outside the canvas`);

	ok(Array.isArray(layout.standingAnchors) && layout.standingAnchors.length === SCENE_LIMITS.agents - SCENE_LIMITS.seats, `${label} must define one standing anchor per seatless agent`);
	unique(layout.standingAnchors.map((anchor: any) => `${anchor.x}:${anchor.y}`), `${label} standing anchors`);
	for (const anchor of layout.standingAnchors) {
		ok(inCanvas(anchor, canvas), `${label} has a standing anchor outside the canvas`);
		ok(Number.isInteger(anchor.lane) && layout.navigation.lanes[anchor.lane] != null, `${label} standing anchor has an invalid lane`);
	}

	for (const seat of layout.seats ?? []) {
		ok(inCanvas(seat.anchor, canvas), `${label} has a seat anchor outside the canvas`);
		ok(Number.isInteger(seat.anchor.lane) && layout.navigation.lanes[seat.anchor.lane] != null, `${label} seat ${seat.index} has an invalid lane`);
	}
	for (const [targetId, target] of Object.entries(layout.targets ?? {}) as Array<[string, any]>) {
		if (target.x < 0 || target.x > canvas.width) continue;
		ok(inCanvas(target, canvas), `${label} target ${targetId} is outside the canvas`);
		ok(Number.isInteger(target.lane) && layout.navigation.lanes[target.lane] != null, `${label} target ${targetId} has an invalid lane`);
	}
	for (const spawn of layout.npcSpawns ?? []) ok(layout.targets?.[spawn], `${label} references missing NPC spawn ${spawn}`);

	if (!formalLayouts.has(filename)) continue;
	ok(Array.isArray(layout.zones) && layout.zones.length > 0, `${label} has no zones`);
	unique(layout.zones.map((zone: any) => zone.id), `${label} zone ids`);
	const zones = new Map(layout.zones.map((zone: any) => [zone.id, zone]));
	ok(zones.has("circulation"), `${label} has no circulation zone`);
	for (const zone of layout.zones) {
		ok(zone.id && zone.name, `${label} has an unnamed zone`);
		ok(Number.isFinite(zone.x) && Number.isFinite(zone.y) && zone.width > 0 && zone.height > 0, `${label} zone ${zone.id} has invalid geometry`);
		ok(zone.x >= 0 && zone.y >= 0 && zone.x + zone.width <= canvas.width && zone.y + zone.height <= canvas.height, `${label} zone ${zone.id} exceeds the canvas`);
	}
	for (const anchor of layout.standingAnchors) {
		const zone: any = zones.get(anchor.zone);
		ok(zone && pointInZone(anchor, zone), `${label} standing anchor is outside zone ${anchor.zone}`);
	}

	ok(Array.isArray(layout.placementSlots) && layout.placementSlots.length > 0, `${label} has no placement slots`);
	unique(layout.placementSlots.map((slot: any) => slot.id), `${label} placement slot ids`);
	const instances = new Map((layout.propInstances ?? []).map((instance: any) => [instance.id, instance]));
	for (const slot of layout.placementSlots) {
		const zone: any = zones.get(slot.zone);
		ok(zone && pointInZone(slot, zone), `${label} slot ${slot.id} is outside zone ${slot.zone}`);
		ok(Array.isArray(slot.accepts) && slot.accepts.length > 0, `${label} slot ${slot.id} accepts nothing`);
		ok(slot.maxSize?.width > 0 && slot.maxSize?.height > 0, `${label} slot ${slot.id} has no size limit`);
		for (const type of slot.accepts) {
			const component: any = propTypes.get(type);
			ok(component, `${label} slot ${slot.id} accepts unknown prop ${type}`);
			ok(component.size.width <= slot.maxSize.width && component.size.height <= slot.maxSize.height, `${label} slot ${slot.id} is too small for ${type}`);
		}
		if (!slot.occupiedBy) continue;
		const instance: any = instances.get(slot.occupiedBy);
		ok(instance, `${label} slot ${slot.id} references missing instance ${slot.occupiedBy}`);
		ok(slot.accepts.includes(instance.type), `${label} slot ${slot.id} rejects its current ${instance.type}`);
		ok(instance.x === slot.x && instance.y === slot.y, `${label} slot ${slot.id} moved its current prop`);
	}
}

console.log(`Layout validation passed: ${layoutFiles.length} standing layouts, ${formalLayouts.size} zoned and slotted official layouts`);
