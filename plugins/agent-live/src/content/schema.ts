export const OFFICE_SPEC_SCHEMA_VERSION = 1 as const;

export const GENDER_VALUES = ["female", "male", "nonbinary", "unspecified"] as const;
export const POSE_VALUES = ["stand", "sit"] as const;
export const ORIENTATION_VALUES = ["horizontal", "vertical"] as const;
export const WEATHER_VALUES = ["clear", "cloudy", "rain", "snow"] as const;

export const OFFICE_SPEC_DEFAULTS = Object.freeze({
	style: "builtin/pixel-classic",
	agentSkin: "builtin/tiny-developers",
	atmosphere: "builtin/default-atmosphere",
	environment: "builtin/local-office-environment",
	agentProfile: Object.freeze({ template: "builtin/host-agent" }),
	placements: Object.freeze([]),
	npcs: Object.freeze([]),
	activities: Object.freeze([]),
});

export type Gender = (typeof GENDER_VALUES)[number];
export type NpcPose = (typeof POSE_VALUES)[number];
export type PropOrientation = (typeof ORIENTATION_VALUES)[number];
export type Weather = (typeof WEATHER_VALUES)[number];

export interface Shift {
	start: string;
	end: string;
}

export interface Appearance {
	skin?: string;
	hair?: string;
	shirt?: string;
	trim?: string;
	badge?: string;
}

export interface OfficePlacement {
	id: string;
	component: string;
	slot: string;
	orientation?: PropOrientation;
}

export interface OfficeNpc {
	id: string;
	template?: string;
	profile?: string;
	name?: string;
	title?: string;
	gender?: Gender;
	appearance?: Appearance;
	spawn?: string;
	shift?: Shift;
	pose?: NpcPose;
}

export interface AgentProfile {
	template: string;
	name?: string;
	title?: string;
	appearance?: Appearance;
}

export interface EnvironmentOverrides {
	clock?: { mode: "local" | "fixed"; fixedTime?: string };
	weather?: { fallback: Weather };
	lighting?: { auto: boolean };
	npcSchedule?: { defaultShift?: Shift; roleOverrides?: Record<string, Shift> };
}

export interface OfficeSpec {
	schemaVersion: typeof OFFICE_SPEC_SCHEMA_VERSION;
	kind: "office-spec";
	id: string;
	name: string;
	origin: "official" | "custom";
	basePreset?: string;
	layout: string;
	style: string;
	agentSkin: string;
	placements: OfficePlacement[];
	npcs: OfficeNpc[];
	activities: string[];
	atmosphere: string;
	environment: string;
	agentProfile?: AgentProfile;
	environmentOverrides?: EnvironmentOverrides;
}

export interface OfficePatch {
	schemaVersion: typeof OFFICE_SPEC_SCHEMA_VERSION;
	kind: "office-patch";
	id?: string;
	base: string;
	name?: string;
	components?: {
		style?: string;
		agentSkin?: string;
		atmosphere?: string;
		environment?: string;
	};
	placements?: { upsert?: OfficePlacement[]; remove?: string[] };
	npcs?: { upsert?: OfficeNpc[]; remove?: string[] };
	activities?: { enable?: string[]; disable?: string[] };
	environmentOverrides?: EnvironmentOverrides | null;
	agentProfile?: AgentProfile | null;
}

export interface OfficeSeed {
	schemaVersion: typeof OFFICE_SPEC_SCHEMA_VERSION;
	kind: "office-seed";
	id: string;
	name: string;
	layout: string;
	style?: string;
	agentSkin?: string;
	atmosphere?: string;
	environment?: string;
	agentProfile?: AgentProfile;
}

export interface SchemaIssue {
	path: string;
	message: string;
}

const SPEC_KEYS = new Set(["schemaVersion", "kind", "id", "name", "origin", "basePreset", "layout", "style", "agentSkin", "placements", "npcs", "activities", "atmosphere", "environment", "environmentOverrides", "agentProfile"]);
const PATCH_KEYS = new Set(["schemaVersion", "kind", "id", "base", "name", "components", "placements", "npcs", "activities", "environmentOverrides", "agentProfile"]);
const SEED_KEYS = new Set(["schemaVersion", "kind", "id", "name", "layout", "style", "agentSkin", "atmosphere", "environment", "agentProfile"]);
/** `layout` is listed only to reject it with a useful message; an Office owns its room. */
const COMPONENT_KEYS = new Set(["layout", "style", "agentSkin", "atmosphere", "environment"]);
const PLACEMENT_KEYS = new Set(["id", "component", "slot", "orientation"]);
const NPC_KEYS = new Set(["id", "template", "profile", "name", "title", "gender", "appearance", "spawn", "shift", "pose"]);
const APPEARANCE_KEYS = new Set(["skin", "hair", "shirt", "trim", "badge"]);
const AGENT_PROFILE_KEYS = new Set(["template", "name", "title", "appearance"]);
const SHIFT_KEYS = new Set(["start", "end"]);
const ENVIRONMENT_KEYS = new Set(["clock", "weather", "lighting", "npcSchedule"]);
const CLOCK_KEYS = new Set(["mode", "fixedTime"]);
const WEATHER_KEYS = new Set(["fallback"]);
const LIGHTING_KEYS = new Set(["auto"]);
const NPC_SCHEDULE_KEYS = new Set(["defaultShift", "roleOverrides"]);
const COLLECTION_PATCH_KEYS = new Set(["upsert", "remove"]);
const ACTIVITY_PATCH_KEYS = new Set(["enable", "disable"]);

function object(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(issues: SchemaIssue[], path: string, message: string) {
	issues.push({ path, message });
}

function exactKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: SchemaIssue[]) {
	for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}.${key}`, "unknown field");
}

function requiredString(value: unknown, path: string, issues: SchemaIssue[]) {
	if (typeof value !== "string" || value.trim() === "") issue(issues, path, "must be a non-empty string");
}

function optionalString(value: unknown, path: string, issues: SchemaIssue[]) {
	if (value !== undefined) requiredString(value, path, issues);
}

function stringArray(value: unknown, path: string, issues: SchemaIssue[]) {
	if (!Array.isArray(value)) return issue(issues, path, "must be an array");
	for (let index = 0; index < value.length; index += 1) requiredString(value[index], `${path}[${index}]`, issues);
}

function enumValue(value: unknown, allowed: readonly string[], path: string, issues: SchemaIssue[], optional = false) {
	if (optional && value === undefined) return;
	if (typeof value !== "string" || !allowed.includes(value)) issue(issues, path, `must be one of: ${allowed.join(", ")}`);
}

function validateShift(value: unknown, path: string, issues: SchemaIssue[]) {
	if (!object(value)) return issue(issues, path, "must be an object");
	exactKeys(value, SHIFT_KEYS, path, issues);
	requiredString(value.start, `${path}.start`, issues);
	requiredString(value.end, `${path}.end`, issues);
}

function validateAppearance(value: unknown, path: string, issues: SchemaIssue[]) {
	if (!object(value)) return issue(issues, path, "must be an object");
	exactKeys(value, APPEARANCE_KEYS, path, issues);
	for (const [key, color] of Object.entries(value)) optionalString(color, `${path}.${key}`, issues);
}

function validatePlacement(value: unknown, path: string, issues: SchemaIssue[]) {
	if (!object(value)) return issue(issues, path, "must be an object");
	exactKeys(value, PLACEMENT_KEYS, path, issues);
	requiredString(value.id, `${path}.id`, issues);
	requiredString(value.component, `${path}.component`, issues);
	requiredString(value.slot, `${path}.slot`, issues);
	enumValue(value.orientation, ORIENTATION_VALUES, `${path}.orientation`, issues, true);
}

function validateNpc(value: unknown, path: string, issues: SchemaIssue[]) {
	if (!object(value)) return issue(issues, path, "must be an object");
	exactKeys(value, NPC_KEYS, path, issues);
	requiredString(value.id, `${path}.id`, issues);
	for (const key of ["template", "profile", "name", "title", "spawn"] as const) optionalString(value[key], `${path}.${key}`, issues);
	enumValue(value.gender, GENDER_VALUES, `${path}.gender`, issues, true);
	enumValue(value.pose, POSE_VALUES, `${path}.pose`, issues, true);
	if (value.appearance !== undefined) validateAppearance(value.appearance, `${path}.appearance`, issues);
	if (value.shift !== undefined) validateShift(value.shift, `${path}.shift`, issues);
}

function validateAgentProfile(value: unknown, path: string, issues: SchemaIssue[]) {
	if (!object(value)) return issue(issues, path, "must be an object");
	exactKeys(value, AGENT_PROFILE_KEYS, path, issues);
	requiredString(value.template, `${path}.template`, issues);
	optionalString(value.name, `${path}.name`, issues);
	optionalString(value.title, `${path}.title`, issues);
	if (value.appearance !== undefined) validateAppearance(value.appearance, `${path}.appearance`, issues);
}

function validateEnvironment(value: unknown, path: string, issues: SchemaIssue[]) {
	if (!object(value)) return issue(issues, path, "must be an object");
	exactKeys(value, ENVIRONMENT_KEYS, path, issues);
	if (value.clock !== undefined) {
		if (!object(value.clock)) issue(issues, `${path}.clock`, "must be an object");
		else {
			exactKeys(value.clock, CLOCK_KEYS, `${path}.clock`, issues);
			enumValue(value.clock.mode, ["local", "fixed"], `${path}.clock.mode`, issues);
			optionalString(value.clock.fixedTime, `${path}.clock.fixedTime`, issues);
		}
	}
	if (value.weather !== undefined) {
		if (!object(value.weather)) issue(issues, `${path}.weather`, "must be an object");
		else {
			exactKeys(value.weather, WEATHER_KEYS, `${path}.weather`, issues);
			enumValue(value.weather.fallback, WEATHER_VALUES, `${path}.weather.fallback`, issues);
		}
	}
	if (value.lighting !== undefined) {
		if (!object(value.lighting)) issue(issues, `${path}.lighting`, "must be an object");
		else {
			exactKeys(value.lighting, LIGHTING_KEYS, `${path}.lighting`, issues);
			if (typeof value.lighting.auto !== "boolean") issue(issues, `${path}.lighting.auto`, "must be a boolean");
		}
	}
	if (value.npcSchedule !== undefined) {
		if (!object(value.npcSchedule)) issue(issues, `${path}.npcSchedule`, "must be an object");
		else {
			exactKeys(value.npcSchedule, NPC_SCHEDULE_KEYS, `${path}.npcSchedule`, issues);
			if (value.npcSchedule.defaultShift !== undefined) validateShift(value.npcSchedule.defaultShift, `${path}.npcSchedule.defaultShift`, issues);
			if (value.npcSchedule.roleOverrides !== undefined) {
				if (!object(value.npcSchedule.roleOverrides)) issue(issues, `${path}.npcSchedule.roleOverrides`, "must be an object");
				else for (const [role, shift] of Object.entries(value.npcSchedule.roleOverrides)) validateShift(shift, `${path}.npcSchedule.roleOverrides.${role}`, issues);
			}
		}
	}
}

export function validateOfficeSpecShape(input: unknown): SchemaIssue[] {
	const issues: SchemaIssue[] = [];
	if (!object(input)) return [{ path: "$", message: "must be an object" }];
	exactKeys(input, SPEC_KEYS, "$", issues);
	if (input.schemaVersion !== OFFICE_SPEC_SCHEMA_VERSION) issue(issues, "$.schemaVersion", `must equal ${OFFICE_SPEC_SCHEMA_VERSION}`);
	if (input.kind !== "office-spec") issue(issues, "$.kind", "must equal office-spec");
	for (const key of ["id", "name", "layout", "style", "agentSkin", "atmosphere", "environment"] as const) requiredString(input[key], `$.${key}`, issues);
	enumValue(input.origin, ["official", "custom"], "$.origin", issues);
	optionalString(input.basePreset, "$.basePreset", issues);
	if (!Array.isArray(input.placements)) issue(issues, "$.placements", "must be an array");
	else input.placements.forEach((value, index) => validatePlacement(value, `$.placements[${index}]`, issues));
	if (!Array.isArray(input.npcs)) issue(issues, "$.npcs", "must be an array");
	else input.npcs.forEach((value, index) => validateNpc(value, `$.npcs[${index}]`, issues));
	stringArray(input.activities, "$.activities", issues);
	if (input.environmentOverrides !== undefined) validateEnvironment(input.environmentOverrides, "$.environmentOverrides", issues);
	if (input.agentProfile !== undefined) validateAgentProfile(input.agentProfile, "$.agentProfile", issues);
	return issues;
}

function validateCollectionPatch(value: unknown, path: string, issues: SchemaIssue[], itemValidator: (value: unknown, path: string, issues: SchemaIssue[]) => void) {
	if (!object(value)) return issue(issues, path, "must be an object");
	exactKeys(value, COLLECTION_PATCH_KEYS, path, issues);
	if (value.upsert !== undefined) {
		if (!Array.isArray(value.upsert)) issue(issues, `${path}.upsert`, "must be an array");
		else value.upsert.forEach((item, index) => itemValidator(item, `${path}.upsert[${index}]`, issues));
	}
	if (value.remove !== undefined) stringArray(value.remove, `${path}.remove`, issues);
}

export function validateOfficePatchShape(input: unknown): SchemaIssue[] {
	const issues: SchemaIssue[] = [];
	if (!object(input)) return [{ path: "$", message: "must be an object" }];
	exactKeys(input, PATCH_KEYS, "$", issues);
	if (input.schemaVersion !== OFFICE_SPEC_SCHEMA_VERSION) issue(issues, "$.schemaVersion", `must equal ${OFFICE_SPEC_SCHEMA_VERSION}`);
	if (input.kind !== "office-patch") issue(issues, "$.kind", "must equal office-patch");
	requiredString(input.base, "$.base", issues);
	optionalString(input.id, "$.id", issues);
	optionalString(input.name, "$.name", issues);
	if (input.components !== undefined) {
		if (!object(input.components)) issue(issues, "$.components", "must be an object");
		else {
			exactKeys(input.components, COMPONENT_KEYS, "$.components", issues);
			// `layout` stays a known key only so it can be rejected with a useful
			// message instead of a generic "unknown field".
			if (input.components.layout !== undefined) {
				issue(issues, "$.components.layout", "an Office keeps its room; edit the Office that already uses that layout instead");
			}
			for (const [key, value] of Object.entries(input.components)) optionalString(value, `$.components.${key}`, issues);
		}
	}
	if (input.placements !== undefined) validateCollectionPatch(input.placements, "$.placements", issues, validatePlacement);
	if (input.npcs !== undefined) validateCollectionPatch(input.npcs, "$.npcs", issues, validateNpc);
	if (input.activities !== undefined) {
		if (!object(input.activities)) issue(issues, "$.activities", "must be an object");
		else {
			exactKeys(input.activities, ACTIVITY_PATCH_KEYS, "$.activities", issues);
			if (input.activities.enable !== undefined) stringArray(input.activities.enable, "$.activities.enable", issues);
			if (input.activities.disable !== undefined) stringArray(input.activities.disable, "$.activities.disable", issues);
		}
	}
	if (input.environmentOverrides !== undefined && input.environmentOverrides !== null) validateEnvironment(input.environmentOverrides, "$.environmentOverrides", issues);
	if (input.agentProfile !== undefined && input.agentProfile !== null) validateAgentProfile(input.agentProfile, "$.agentProfile", issues);
	return issues;
}

export function validateOfficeSeedShape(input: unknown): SchemaIssue[] {
	const issues: SchemaIssue[] = [];
	if (!object(input)) return [{ path: "$", message: "must be an object" }];
	exactKeys(input, SEED_KEYS, "$", issues);
	if (input.schemaVersion !== OFFICE_SPEC_SCHEMA_VERSION) issue(issues, "$.schemaVersion", `must equal ${OFFICE_SPEC_SCHEMA_VERSION}`);
	if (input.kind !== "office-seed") issue(issues, "$.kind", "must equal office-seed");
	for (const key of ["id", "name", "layout"] as const) requiredString(input[key], `$.${key}`, issues);
	for (const key of ["style", "agentSkin", "atmosphere", "environment"] as const) optionalString(input[key], `$.${key}`, issues);
	if (input.agentProfile !== undefined) validateAgentProfile(input.agentProfile, "$.agentProfile", issues);
	return issues;
}
