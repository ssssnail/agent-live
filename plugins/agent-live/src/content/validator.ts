import { SCENE_LIMITS } from "../core/limits.ts";
import {
	GENDER_VALUES,
	POSE_VALUES,
	WEATHER_VALUES,
	type OfficeSpec,
	type SchemaIssue,
	validateOfficeSpecShape,
} from "./schema.ts";

import { layoutIssues, resolveActivityRequirements } from "./graph-validator.ts";

export interface ComponentLibraryView {
	descriptors: {
		styles: any[];
		layouts: any[];
		agentSkins: any[];
		atmospheres: any[];
		environments: any[];
	};
	styles: Set<string>;
	layouts: Map<string, any>;
	agentSkins: Set<string>;
	props: Map<string, any>;
	npcTemplates: Map<string, any>;
	agentProfileTemplates: Map<string, any>;
	activityRecipes: Map<string, any>;
	activityImplementations: Map<string, any>;
	atmospheres: Set<string>;
	environments: Set<string>;
	defaultNpcTemplate: string;
	npcProfilePolicy: { selection: string; seedFrom: string; persistResolvedProfile: boolean };
}

export interface ValidationIssue extends SchemaIssue {
	code: string;
}

export interface ValidationResult {
	valid: boolean;
	issues: ValidationIssue[];
}

function add(issues: ValidationIssue[], code: string, path: string, message: string) {
	issues.push({ code, path, message });
}

function validClock(value: unknown) {
	if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
	const [hour, minute] = value.split(":").map(Number);
	return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function validateShift(value: any, path: string, issues: ValidationIssue[]) {
	if (!validClock(value?.start) || !validClock(value?.end)) add(issues, "invalid-shift", path, "shift must contain valid HH:MM start and end values");
	if (value?.endLatest !== undefined && !validClock(value.endLatest)) add(issues, "invalid-shift", `${path}.endLatest`, "endLatest must be a valid HH:MM value");
}

/** Delegates to the shared rules so saving and rendering can never disagree. */
function validateLayoutContract(layout: any, library: ComponentLibraryView, issues: ValidationIssue[]) {
	const propTypeNames = [...library.props.keys()].map((id) => id.replace(/^(builtin|local)\//, ""));
	for (const issue of layoutIssues(layout, propTypeNames)) add(issues, issue.code, issue.path, issue.message);
}

const OFFICE_ID = /^(builtin|local)\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
const INSTANCE_ID = /^[a-z0-9][a-z0-9-]*$/;
const COLOR = /^#[0-9a-f]{6}$/i;

export function validateOfficeSpec(spec: unknown, library: ComponentLibraryView): ValidationResult {
	const issues: ValidationIssue[] = validateOfficeSpecShape(spec).map((entry) => ({ ...entry, code: "invalid-shape" }));
	if (issues.length || !spec || typeof spec !== "object") return { valid: false, issues };
	const value = spec as OfficeSpec;
	if (!OFFICE_ID.test(value.id)) add(issues, "invalid-office-id", "$.id", "office id must use a safe builtin/ or local/ identifier");
	if (value.origin === "official" && !value.id.startsWith("builtin/")) add(issues, "invalid-office-origin", "$.origin", "official offices require a builtin/ id");
	if (value.origin === "custom" && !value.id.startsWith("local/")) add(issues, "invalid-office-origin", "$.origin", "custom offices require a local/ id");

	if (!library.layouts.has(value.layout)) add(issues, "unknown-layout", "$.layout", `unknown layout ${value.layout}`);
	if (!library.styles.has(value.style)) add(issues, "unknown-style", "$.style", `unknown style ${value.style}`);
	if (!library.agentSkins.has(value.agentSkin)) add(issues, "unknown-agent-skin", "$.agentSkin", `unknown agent skin ${value.agentSkin}`);
	if (!library.atmospheres.has(value.atmosphere)) add(issues, "unknown-atmosphere", "$.atmosphere", `unknown atmosphere ${value.atmosphere}`);
	if (!library.environments.has(value.environment)) add(issues, "unknown-environment", "$.environment", `unknown environment ${value.environment}`);
	if (value.agentProfile) {
		if (!library.agentProfileTemplates.has(value.agentProfile.template)) add(issues, "unknown-agent-profile-template", "$.agentProfile.template", `unknown Agent Profile template ${value.agentProfile.template}`);
		for (const [field, color] of Object.entries(value.agentProfile.appearance ?? {})) if (!COLOR.test(String(color))) add(issues, "invalid-color", `$.agentProfile.appearance.${field}`, "appearance colors must use #RRGGBB");
	}

	const layout = library.layouts.get(value.layout);
	if (!layout) return { valid: false, issues };
	validateLayoutContract(layout, library, issues);
	for (const [id, text] of Object.entries(value.texts ?? {})) {
		const slot = (layout.textSlots ?? []).find((entry: any) => entry.id === id);
		if (!slot) add(issues, "unknown-text-area", `$.texts.${id}`, `unknown text area ${id}`);
		else if ([...text].length > slot.maxLength) add(issues, "text-too-long", `$.texts.${id}`, `maximum ${slot.maxLength} characters`);
	}
	const slots = new Map((layout.placementSlots ?? []).map((slot: any) => [slot.id, slot]));
	const placementIds = new Set<string>();
	const occupiedSlots = new Set<string>();
	for (let index = 0; index < value.placements.length; index += 1) {
		const placement = value.placements[index];
		const path = `$.placements[${index}]`;
		if (!INSTANCE_ID.test(placement.id)) add(issues, "invalid-placement-id", `${path}.id`, "placement id must be a safe lowercase identifier");
		if (placementIds.has(placement.id)) add(issues, "duplicate-placement", `${path}.id`, `duplicate placement id ${placement.id}`);
		placementIds.add(placement.id);
		const component = library.props.get(placement.component);
		if (!component) add(issues, "unknown-prop", `${path}.component`, `unknown prop ${placement.component}`);
		const slot: any = slots.get(placement.slot);
		if (!slot) add(issues, "unknown-slot", `${path}.slot`, `unknown slot ${placement.slot}`);
		else {
			if (occupiedSlots.has(placement.slot)) add(issues, "occupied-slot", `${path}.slot`, `slot ${placement.slot} is already occupied`);
			occupiedSlots.add(placement.slot);
			const propType = placement.component.replace(/^builtin\//, "");
			if (component && !slot.accepts?.includes(propType)) add(issues, "incompatible-slot", path, `${placement.component} is not accepted by ${placement.slot}`);
			if (component && (component.size.width > slot.maxSize?.width || component.size.height > slot.maxSize?.height)) add(issues, "prop-too-large", path, `${placement.component} exceeds ${placement.slot}`);
		}
	}
	if (value.placements.length > SCENE_LIMITS.props) add(issues, "too-many-props", "$.placements", `maximum ${SCENE_LIMITS.props} props`);

	const npcIds = new Set<string>();
	for (let index = 0; index < value.npcs.length; index += 1) {
		const npc = value.npcs[index];
		const path = `$.npcs[${index}]`;
		if (!INSTANCE_ID.test(npc.id)) add(issues, "invalid-npc-id", `${path}.id`, "NPC id must be a safe lowercase identifier");
		if (npcIds.has(npc.id)) add(issues, "duplicate-npc", `${path}.id`, `duplicate NPC id ${npc.id}`);
		npcIds.add(npc.id);
		const template = npc.template ? library.npcTemplates.get(npc.template) : undefined;
		if (!npc.template || !template) add(issues, "unknown-npc-template", `${path}.template`, `unknown NPC template ${npc.template ?? "(missing)"}`);
		if (npc.profile && (!template?.defaultProfiles || !template.defaultProfiles.some((profile: any) => profile.id === npc.profile))) add(issues, "unknown-npc-profile", `${path}.profile`, `unknown profile ${npc.profile}`);
		if (npc.gender && !GENDER_VALUES.includes(npc.gender)) add(issues, "invalid-gender", `${path}.gender`, `unsupported gender ${npc.gender}`);
		if (npc.pose && !POSE_VALUES.includes(npc.pose)) add(issues, "invalid-pose", `${path}.pose`, `unsupported pose ${npc.pose}`);
		for (const [field, color] of Object.entries(npc.appearance ?? {})) if (!COLOR.test(String(color))) add(issues, "invalid-color", `${path}.appearance.${field}`, "appearance colors must use #RRGGBB");
		if (!npc.spawn || !layout.npcSpawns?.includes(npc.spawn) || !layout.targets?.[npc.spawn]) add(issues, "invalid-npc-spawn", `${path}.spawn`, `invalid NPC spawn ${npc.spawn ?? "(missing)"}`);
		if (npc.shift) validateShift(npc.shift, `${path}.shift`, issues);
	}
	if (value.npcs.length > SCENE_LIMITS.npcs) add(issues, "too-many-npcs", "$.npcs", `maximum ${SCENE_LIMITS.npcs} NPCs`);

	const activities = new Set<string>();
	// Instance table for activity requirements: layout built-ins plus this office's placements.
	const propInstances = new Map<string, string>();
	const replaceableIds = new Set((layout.placementSlots ?? []).map((slot: any) => slot.occupiedBy).filter(Boolean));
	for (const instance of layout.propInstances ?? []) if (!replaceableIds.has(instance.id)) propInstances.set(instance.id, instance.type);
	for (const placement of value.placements) propInstances.set(placement.id, placement.component.replace(/^(builtin|local)\//, ""));
	const capabilitiesOf = (type: string): readonly string[] => {
		const prop = library.props.get(`builtin/${type}`) ?? library.props.get(`local/${type}`) ?? library.props.get(type);
		return prop?.capabilities ?? [];
	};
	// A routine performs at the position its target names, so a prop that satisfies
	// a capability has to sit where the layout prepared that capability: the slot
	// occupied by the layout's own prop of that capability.
	const preparedSlots = new Map<string, string>();
	for (const slot of layout.placementSlots ?? []) {
		const builtin = (layout.propInstances ?? []).find((instance: any) => instance.id === slot.occupiedBy);
		if (!builtin) continue;
		for (const capability of capabilitiesOf(builtin.type)) if (!preparedSlots.has(capability)) preparedSlots.set(capability, slot.id);
	}
	const npcRoles = new Set(value.npcs.map((npc) => library.npcTemplates.get(npc.template ?? "")?.role).filter(Boolean));
	for (let index = 0; index < value.activities.length; index += 1) {
		const activityId = value.activities[index];
		const path = `$.activities[${index}]`;
		if (activities.has(activityId)) add(issues, "duplicate-activity", path, `duplicate activity ${activityId}`);
		activities.add(activityId);
		const recipe = library.activityRecipes.get(activityId);
		if (!recipe) add(issues, "unknown-activity", path, `unknown activity ${activityId}`);
		else if (!library.activityImplementations.has(`${value.layout}|${activityId}`)) add(issues, "unsupported-activity-layout", path, `${activityId} has no implementation for ${value.layout}`);
		else {
			const implementation = library.activityImplementations.get(`${value.layout}|${activityId}`);
			const resolved = resolveActivityRequirements(implementation?.definition?.requires, propInstances, capabilitiesOf, activityId);
			for (const issue of resolved.issues) add(issues, issue.code, path, issue.message);
			if (!resolved.issues.length) {
				// The requirement may be satisfied in place, never by relocating the prop:
				// the routine would keep performing where that prop used to be.
				(implementation?.definition?.requires ?? []).forEach((requirement: any, requirementIndex: number) => {
					const capability = requirement && typeof requirement === "object" && typeof requirement.capability === "string" ? requirement.capability : undefined;
					const bound = resolved.bindings[requirementIndex];
					const placement = capability && bound ? value.placements.find((entry) => entry.id === bound) : undefined;
					if (!placement) return;
					const prepared = preparedSlots.get(capability);
					if (prepared === placement.slot) return;
					add(issues, "capability-prop-slot", path, `${placement.id} provides ${capability} from ${placement.slot}, but ${activityId} performs where this layout prepared ${capability}${prepared ? ` (${prepared})` : ""}; keep the prop where it is instead of relocating it`);
				});
			}
			if (!resolved.issues.length && recipe.participantKinds?.includes("npc") && recipe.participantKinds.length === 1 && recipe.participantRoles?.length && !recipe.participantRoles.some((role: string) => npcRoles.has(role))) {
				add(issues, "missing-activity-participant", path, `${activityId} has no compatible NPC in this office`);
			}
		}
	}
	if (value.activities.length > SCENE_LIMITS.activities) add(issues, "too-many-activities", "$.activities", `maximum ${SCENE_LIMITS.activities} activities`);

	const overrides = value.environmentOverrides;
	if (overrides?.clock?.mode === "fixed" && !validClock(overrides.clock.fixedTime)) add(issues, "invalid-fixed-time", "$.environmentOverrides.clock.fixedTime", "fixed clock requires a valid HH:MM value");
	if (overrides?.clock?.mode === "local" && overrides.clock.fixedTime !== undefined) add(issues, "unused-fixed-time", "$.environmentOverrides.clock.fixedTime", "local clock cannot include fixedTime");
	if (overrides?.weather && !WEATHER_VALUES.includes(overrides.weather.fallback)) add(issues, "invalid-weather", "$.environmentOverrides.weather.fallback", "unsupported weather");
	if (overrides?.npcSchedule?.defaultShift) validateShift(overrides.npcSchedule.defaultShift, "$.environmentOverrides.npcSchedule.defaultShift", issues);
	for (const [role, shift] of Object.entries(overrides?.npcSchedule?.roleOverrides ?? {})) {
		if (![...library.npcTemplates.values()].some((template) => template.role === role)) add(issues, "unknown-npc-role", `$.environmentOverrides.npcSchedule.roleOverrides.${role}`, `unknown NPC role ${role}`);
		validateShift(shift, `$.environmentOverrides.npcSchedule.roleOverrides.${role}`, issues);
	}

	return { valid: issues.length === 0, issues };
}
