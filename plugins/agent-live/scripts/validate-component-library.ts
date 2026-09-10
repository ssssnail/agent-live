import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentRoot = path.join(pluginRoot, "web", "v2", "content");
const libraryRoot = path.join(contentRoot, "component-library");

function read(file: string): any {
	return JSON.parse(fs.readFileSync(file, "utf8"));
}

function ok(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function jsonFiles(directory: string) {
	return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
}

const catalog = read(path.join(libraryRoot, "catalog.json"));
ok(catalog.schemaVersion === 1 && catalog.kind === "component-library", "invalid component library catalog");
ok(catalog.contract === "single-office-v1", "component library uses an unsupported contract");

const props = read(path.join(libraryRoot, catalog.registries.props));
const npcTemplates = read(path.join(libraryRoot, catalog.registries.npcTemplates));
const agentProfileTemplates = read(path.join(libraryRoot, catalog.registries.agentProfileTemplates));
const activityRecipes = read(path.join(libraryRoot, catalog.registries.activityRecipes));
ok(props.kind === "prop-library", "invalid prop library");
ok(npcTemplates.kind === "npc-template-library", "invalid NPC template library");
ok(agentProfileTemplates.kind === "agent-profile-template-library", "invalid Agent Profile template library");
ok(activityRecipes.kind === "activity-recipe-library", "invalid activity recipe library");

const componentIds = new Set<string>();
function validateEntries(entries: any[], kind: string) {
	ok(Array.isArray(entries) && entries.length > 0, `${kind} registry is empty`);
	for (const entry of entries) {
		ok(typeof entry.id === "string" && entry.id.startsWith("builtin/"), `${kind} has an invalid id`);
		ok(!componentIds.has(entry.id), `duplicate component id ${entry.id}`);
		ok(typeof entry.name === "string" && entry.name.length > 0, `${entry.id} is missing a name`);
		ok(typeof entry.description === "string" && entry.description.length > 0, `${entry.id} is missing a description`);
		ok(Array.isArray(entry.tags) && entry.tags.length > 0, `${entry.id} is missing Creator-facing tags`);
		componentIds.add(entry.id);
	}
}
validateEntries(props.entries, "prop");
validateEntries(npcTemplates.entries, "NPC template");
validateEntries(agentProfileTemplates.entries, "Agent Profile template");
validateEntries(activityRecipes.entries, "activity recipe");

const allowedCapabilities = new Set(["research", "create", "compute", "plan", "communicate", "collaborate", "coffee", "water"]);
const propByType = new Map<string, any>();
for (const entry of props.entries) {
	ok(entry.renderer === entry.id.slice("builtin/".length), `${entry.id} renderer must retain the stable legacy type`);
	ok(Number.isFinite(entry.size?.width) && Number.isFinite(entry.size?.height), `${entry.id} has an invalid size`);
	for (const capability of entry.capabilities ?? []) ok(allowedCapabilities.has(capability), `${entry.id} has unknown capability ${capability}`);
	propByType.set(entry.renderer, entry);
}

const legacyPropTypes = new Map<string, string>();
for (const filename of jsonFiles(path.join(contentRoot, "props"))) {
	const manifest = read(path.join(contentRoot, "props", filename));
	for (const [type, definition] of Object.entries(manifest.types ?? {})) {
		const serialized = JSON.stringify(definition);
		const previous = legacyPropTypes.get(type);
		ok(previous == null || previous === serialized, `legacy prop ${type} has conflicting definitions`);
		legacyPropTypes.set(type, serialized);
		const component = propByType.get(type);
		ok(component, `component library is missing prop ${type}`);
		ok(JSON.stringify({ size: component.size, capabilities: component.capabilities, renderer: component.renderer }) === serialized, `component ${component.id} changed the legacy rendering contract`);
	}
}
ok(propByType.size === legacyPropTypes.size, "prop library contains entries that no runtime bundle implements");

const templateRoles = new Set(npcTemplates.entries.map((entry: any) => entry.role));
const templateById = new Map(npcTemplates.entries.map((entry: any) => [entry.id, entry]));
const legacyRoles = new Set<string>();
for (const filename of jsonFiles(path.join(contentRoot, "npcs"))) {
	const manifest = read(path.join(contentRoot, "npcs", filename));
	for (const entry of manifest.entries ?? []) legacyRoles.add(entry.role);
}
for (const role of legacyRoles) ok(templateRoles.has(role), `component library is missing NPC role ${role}`);
ok(templateById.has(npcTemplates.defaultTemplate), `NPC default template ${npcTemplates.defaultTemplate} does not exist`);
ok(Array.isArray(npcTemplates.genderValues) && npcTemplates.genderValues.includes("unspecified"), "NPC library must declare an unspecified gender fallback");
ok(npcTemplates.defaultInstancePolicy?.selection === "seeded-random-profile", "default NPCs must use seeded random profiles");
ok(npcTemplates.defaultInstancePolicy?.seedFrom === "instance-id", "default NPC profile selection must be stable per instance");
ok(npcTemplates.defaultInstancePolicy?.persistResolvedProfile === true, "resolved NPC profiles must be persisted");
for (const entry of npcTemplates.entries) {
	ok(["sit", "stand"].includes(entry.defaultPose), `${entry.id} has an unsupported default pose`);
	ok(npcTemplates.genderValues.includes(entry.defaultGender), `${entry.id} has an invalid default gender`);
	ok(entry.defaultAppearance && ["skin", "hair", "shirt", "trim", "badge"].every((field) => typeof entry.defaultAppearance[field] === "string"), `${entry.id} has an incomplete default appearance`);
	ok(Array.isArray(entry.allowedActivities), `${entry.id} has no allowedActivities contract`);
	ok(Array.isArray(entry.allowedOverrides) && ["name", "title", "gender", "appearance", "spawn", "shift", "pose"].every((field) => entry.allowedOverrides.includes(field)), `${entry.id} has an incomplete override contract`);
}
const defaultNpc: any = templateById.get(npcTemplates.defaultTemplate);
ok(defaultNpc.role === "colleague", "the default NPC identity must be a background colleague");
ok(JSON.stringify(defaultNpc.allowedBehaviors) === JSON.stringify(["work", "restroom", "water", "shift-departure"]), "the default NPC behavior boundary changed");
ok(Array.isArray(defaultNpc.defaultProfiles) && defaultNpc.defaultProfiles.length >= 2, "the default NPC needs multiple random profiles");
const profileIds = new Set<string>();
for (const profile of defaultNpc.defaultProfiles) {
	ok(typeof profile.id === "string" && !profileIds.has(profile.id), "default NPC profile ids must be unique");
	ok(typeof profile.name === "string" && profile.name.length > 0, `${profile.id} is missing a default name`);
	ok(npcTemplates.genderValues.includes(profile.gender), `${profile.id} has an invalid gender`);
	ok(profile.appearance && ["skin", "hair", "shirt", "trim", "badge"].every((field) => typeof profile.appearance[field] === "string"), `${profile.id} has an incomplete appearance`);
	profileIds.add(profile.id);
}

ok(agentProfileTemplates.entries.some((entry: any) => entry.id === agentProfileTemplates.defaultTemplate), "Agent Profile default template does not exist");
for (const entry of agentProfileTemplates.entries) {
	ok(Array.isArray(entry.allowedOverrides) && ["name", "title", "appearance"].every((field) => entry.allowedOverrides.includes(field)), `${entry.id} has an incomplete override contract`);
}

const recipeNames = new Set<string>(activityRecipes.entries.map((entry: any) => String(entry.id).slice("builtin/".length)));
const legacyActivities = new Set<string>();
for (const filename of jsonFiles(path.join(contentRoot, "life-activities"))) {
	const manifest = read(path.join(contentRoot, "life-activities", filename));
	for (const entry of manifest.entries ?? []) legacyActivities.add(entry.id);
}
ok(recipeNames.size === activityRecipes.entries.length, "activity recipe ids must be unique");
for (const id of legacyActivities) ok(recipeNames.has(id), `component library is missing activity ${id}`);
for (const id of recipeNames) ok(legacyActivities.has(id), `activity ${id} is not implemented by current content`);
for (const entry of activityRecipes.entries) {
	ok(Array.isArray(entry.participantKinds) && entry.participantKinds.length > 0, `${entry.id} has no participant kind`);
	ok(entry.participantKinds.every((kind: string) => kind === "agent" || kind === "npc"), `${entry.id} has an invalid participant kind`);
	if (entry.minimumAgents != null) ok(Number.isInteger(entry.minimumAgents) && entry.minimumAgents >= 2, `${entry.id} has an invalid minimumAgents`);
	for (const capability of entry.capabilities ?? []) ok(allowedCapabilities.has(capability), `${entry.id} has unknown capability ${capability}`);
}

const recipeById = new Map(activityRecipes.entries.map((entry: any) => [entry.id, entry]));
for (const template of npcTemplates.entries) {
	for (const activityId of template.allowedActivities) {
		const recipe: any = recipeById.get(activityId);
		ok(recipe, `${template.id} references missing activity ${activityId}`);
		ok(recipe.participantKinds.includes("npc"), `${activityId} does not allow NPC participants required by ${template.id}`);
		ok(!recipe.participantRoles?.length || recipe.participantRoles.includes(template.role), `${activityId} does not allow role ${template.role}`);
	}
}
for (const recipe of activityRecipes.entries) {
	for (const role of recipe.participantRoles ?? []) {
		const compatible = npcTemplates.entries.some((template: any) => template.role === role && template.allowedActivities.includes(recipe.id));
		ok(compatible, `${recipe.id} allows NPC role ${role} without a matching template contract`);
	}
}

const catalogKinds: Array<[string, string]> = [
	["styles", "styles"],
	["layouts", "layouts"],
	["agentSkins", "agent-skins"],
	["atmospheres", "atmospheres"],
	["environments", "environments"],
];
for (const [catalogKey, directory] of catalogKinds) {
	const actual = jsonFiles(path.join(contentRoot, directory)).map((filename) => read(path.join(contentRoot, directory, filename)).id).sort();
	ok(Array.isArray(catalog[catalogKey]), `component catalog ${catalogKey} is missing`);
	for (const entry of catalog[catalogKey]) {
		ok(entry && typeof entry.id === "string", `component catalog ${catalogKey} has an invalid entry`);
		ok(typeof entry.name === "string" && typeof entry.description === "string", `${entry.id} is missing Creator-facing text`);
		ok(Array.isArray(entry.tags) && entry.tags.length > 0, `${entry.id} is missing Creator-facing tags`);
	}
	const declared = catalog[catalogKey].map((entry: any) => entry.id).sort();
	ok(JSON.stringify(actual) === JSON.stringify(declared), `component catalog ${catalogKey} does not match implemented manifests`);
	for (const id of actual) {
		ok(!componentIds.has(id), `duplicate component id ${id}`);
		componentIds.add(id);
	}
}

console.log(`Component library validation passed: ${props.entries.length} props, ${npcTemplates.entries.length} NPC templates, ${agentProfileTemplates.entries.length} Agent Profile template, ${activityRecipes.entries.length} activity recipes, ${componentIds.size} unique component ids`);
