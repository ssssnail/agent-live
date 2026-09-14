import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENE_LIMITS } from "../src/core/limits.ts";
import { DYNAMIC_ACTIVITY_TARGETS } from "../src/content/graph-validator.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(projectRoot, "web", "v2", "content");

function read(relativePath: string): any {
	return JSON.parse(fs.readFileSync(path.join(contentRoot, relativePath), "utf8"));
}

function ok(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function validClock(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
	const [hour, minute] = value.split(":").map(Number);
	return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function validateShift(shift: any, label: string) {
	ok(shift && validClock(shift.start) && validClock(shift.end), `${label}: shift must use valid HH:MM start/end values`);
	ok(shift.endLatest === undefined || validClock(shift.endLatest), `${label}: endLatest must be a valid HH:MM value`);
}

const expectedKinds: Record<string, string> = {
	style: "style",
	layout: "layout",
	agentSkin: "agent-skin",
	props: "props",
	npcs: "npcs",
	lifeActivities: "life-activities",
	atmosphere: "atmosphere",
	environment: "environment",
};
const requiredCapabilities = ["research", "create", "compute", "plan", "communicate", "collaborate"];

function validatePreset(filename: string) {
	const preset = read(`presets/${filename}`);
	ok(preset.schemaVersion === 1 && preset.kind === "preset", `${filename}: invalid preset`);
	ok(Boolean(preset.id && preset.version), `${filename}: missing id or version`);
	const refs = preset.content;
	ok(refs && typeof refs === "object", `${filename}: missing content references`);

	const content = {
		style: read(`styles/${refs.style}.json`),
		layout: read(`layouts/${refs.layout}.json`),
		agentSkin: read(`agent-skins/${refs.agentSkin}.json`),
		props: read(`props/${refs.props}.json`),
		npcs: read(`npcs/${refs.npcs}.json`),
		lifeActivities: read(`life-activities/${refs.lifeActivities}.json`),
		atmosphere: read(`atmospheres/${refs.atmosphere}.json`),
		environment: read(`environments/${refs.environment}.json`),
	};

	for (const [key, value] of Object.entries(content)) {
		ok(value.schemaVersion === 1, `${filename}/${key}: unsupported schema`);
		ok(value.kind === expectedKinds[key], `${filename}/${key}: expected kind ${expectedKinds[key]}`);
		ok(Boolean(value.id && value.version), `${filename}/${key}: missing id or version`);
	}

	const { layout, props, agentSkin, npcs, lifeActivities, environment } = content;
	ok(layout.propInstances.length <= SCENE_LIMITS.props, `${filename}/layout: too many props`);
	ok(npcs.entries.length <= SCENE_LIMITS.npcs, `${filename}/npcs: too many NPCs`);
	ok(lifeActivities.entries.length <= SCENE_LIMITS.activities, `${filename}/life: too many activities`);
	ok(layout.contract === "single-office-v1", `${filename}/layout: unsupported contract`);
	ok(layout.canvas.width === 384 && layout.canvas.height === 216, `${filename}/layout: canvas must be 384x216`);
	ok(layout.seats.length === 8, `${filename}/layout: single-office-v1 must have 8 seats`);
	ok(new Set(layout.seats.map((seat: any) => seat.index)).size === 8, `${filename}/layout: seat indices must be unique`);
	ok(Array.isArray(layout.navigation.lanes) && layout.navigation.lanes.length > 0, `${filename}/layout: missing lanes`);
	ok(Array.isArray(layout.navigation.connectors) && layout.navigation.connectors.length > 0, `${filename}/layout: missing connectors`);

	for (const capability of requiredCapabilities) {
		ok(layout.stations[capability], `${filename}/layout: missing ${capability}`);
	}
	for (const station of Object.values(layout.stations) as any[]) {
		if (station.kind === "target") ok(layout.targets[station.target], `${filename}/layout: missing target ${station.target}`);
	}

	const instanceIds = new Set<string>();
	for (const instance of layout.propInstances) {
		ok(props.types[instance.type], `${filename}/layout: unknown prop type ${instance.type}`);
		ok(!instanceIds.has(instance.id), `${filename}/layout: duplicate prop instance ${instance.id}`);
		instanceIds.add(instance.id);
	}

	const npcIds = new Set<string>();
	for (const npc of npcs.entries) {
		ok(npc.id && npc.name && npc.role, `${filename}/npcs: incomplete NPC`);
		ok(!npcIds.has(npc.id), `${filename}/npcs: duplicate NPC ${npc.id}`);
		ok(layout.targets[npc.spawn], `${filename}/npcs: missing spawn target ${npc.spawn}`);
		if (npc.shift) validateShift(npc.shift, `${filename}/npcs/${npc.id}`);
		npcIds.add(npc.id);
	}

	const activityIds = new Set<string>();
	for (const activity of lifeActivities.entries) {
		ok(activity.id && activity.participant, `${filename}/life: incomplete activity`);
		ok(!activityIds.has(activity.id), `${filename}/life: duplicate activity ${activity.id}`);
		ok(["agent", "npc", "person"].includes(activity.participant.kind), `${filename}/life: invalid participant kind`);
		if (activity.participant.minAgents != null) {
			ok(Number.isInteger(activity.participant.minAgents) && activity.participant.minAgents >= 2, `${filename}/life: invalid minAgents`);
		}
		ok(Array.isArray(activity.steps) && activity.steps.length > 0, `${filename}/life: activity ${activity.id} has no steps`);
		for (const required of activity.requires ?? []) {
			ok(instanceIds.has(required), `${filename}/life: activity ${activity.id} requires missing prop ${required}`);
		}
		for (const step of activity.steps) {
			ok(layout.targets[step.target] || DYNAMIC_ACTIVITY_TARGETS.has(step.target), `${filename}/life: activity ${activity.id} targets missing ${step.target}`);
			for (const target of step.targets ?? []) {
				ok(layout.targets[target], `${filename}/life: activity ${activity.id} group target missing ${target}`);
			}
		}
		activityIds.add(activity.id);
	}

	ok(["local", "fixed"].includes(environment.clock?.mode), `${filename}/environment: invalid clock mode`);
	if (environment.clock.mode === "fixed") ok(validClock(environment.clock.fixedTime), `${filename}/environment: invalid fixed time`);
	ok(Array.isArray(environment.clock?.phases) && environment.clock.phases.length > 0, `${filename}/environment: missing day phases`);
	for (const phase of environment.clock.phases) {
		ok(phase.id && validClock(phase.start), `${filename}/environment: invalid day phase`);
	}
	ok(Array.isArray(environment.weather?.allowedConditions) && environment.weather.allowedConditions.length > 0, `${filename}/environment: missing weather conditions`);
	const allowedWeather = new Set(environment.weather.allowedConditions);
	for (const condition of [environment.weather.condition, environment.weather.fallback]) {
		if (condition != null) ok(allowedWeather.has(condition), `${filename}/environment: weather ${condition} is not allowed`);
	}
	validateShift(environment.npcSchedule?.defaultShift, `${filename}/environment/default NPC`);
	for (const [role, shift] of Object.entries(environment.npcSchedule?.roleOverrides ?? {})) {
		validateShift(shift, `${filename}/environment/role ${role}`);
	}

	if (filename === "demo-office.json") {
		ok(layout.navigation.lanes.join(",") === "46,100,162", "demo layout: lane parity changed");
		ok(layout.navigation.connectors.join(",") === "76,140,204,276", "demo layout: connector parity changed");
		ok(agentSkin.animations.join(",") === "idle,walk,sit,type,reach,talk", "demo agent skin: animation parity changed");
		ok(Object.keys(agentSkin.roles).length === 13, "demo agent skin: role parity changed");
		ok(Object.keys(content.style.tokens.css).length === 10, "demo style: UI token parity changed");
		ok(npcs.entries.length === 0, "demo replica must not add NPCs");
		ok(lifeActivities.entries.length === 0, "demo replica must not add Life Activities");
	}

	return preset.id;
}

const presetFiles = fs.readdirSync(path.join(contentRoot, "presets")).filter((name) => name.endsWith(".json")).sort();
const presetIds = presetFiles.map(validatePreset);
const catalog = read("catalog.json");
ok(catalog.schemaVersion === 1 && catalog.kind === "preset-catalog", "invalid preset catalog");
ok(Array.isArray(catalog.presets) && catalog.presets.length === presetFiles.length, "preset catalog is incomplete");
const catalogIds = new Set(catalog.presets.map((item: any) => `builtin/${item.id}`));
for (const presetId of presetIds) ok(catalogIds.has(presetId), `preset catalog missing ${presetId}`);
console.log(`Content validation passed: ${presetIds.join(", ")}`);
