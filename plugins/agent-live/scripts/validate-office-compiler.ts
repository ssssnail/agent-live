import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { compileOfficePatch, compileOfficeSpec } from "../src/content/compiler.ts";
import type { OfficeSpec } from "../src/content/schema.ts";
import { validateOfficeSpec, type ComponentLibraryView } from "../src/content/validator.ts";

function ok(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "v2", "content");
const read = (relativePath: string) => JSON.parse(fs.readFileSync(path.join(contentRoot, relativePath), "utf8"));
const catalog = read("component-library/catalog.json");
const propLibrary = read(`component-library/${catalog.registries.props}`);
const npcLibrary = read(`component-library/${catalog.registries.npcTemplates}`);
const agentProfileLibrary = read(`component-library/${catalog.registries.agentProfileTemplates}`);
const activityLibrary = read(`component-library/${catalog.registries.activityRecipes}`);
const activityImplementations = read(`component-library/${catalog.registries.activityImplementations}`);
const ids = (entries: any[]) => new Set(entries.map((entry) => entry.id));
const layouts = new Map<string, any>(catalog.layouts.map((entry: any) => [entry.id, read(`layouts/${entry.id.replace(/^builtin\//, "")}.json`)]));
const library: ComponentLibraryView = {
	descriptors: { styles: catalog.styles, layouts: catalog.layouts, agentSkins: catalog.agentSkins, atmospheres: catalog.atmospheres, environments: catalog.environments },
	styles: ids(catalog.styles),
	layouts,
	agentSkins: ids(catalog.agentSkins),
	props: new Map(propLibrary.entries.map((entry: any) => [entry.id, entry])),
	npcTemplates: new Map(npcLibrary.entries.map((entry: any) => [entry.id, entry])),
	agentProfileTemplates: new Map(agentProfileLibrary.entries.map((entry: any) => [entry.id, entry])),
	activityRecipes: new Map(activityLibrary.entries.map((entry: any) => [entry.id, entry])),
	activityImplementations: new Map(activityImplementations.entries.map((entry: any) => [`${entry.layout}|${entry.recipe}`, entry])),
	atmospheres: ids(catalog.atmospheres),
	environments: ids(catalog.environments),
	defaultNpcTemplate: npcLibrary.defaultTemplate,
	npcProfilePolicy: npcLibrary.defaultInstancePolicy,
};

const base: OfficeSpec = {
	schemaVersion: 1,
	kind: "office-spec",
	id: "builtin/tech-open-office",
	name: "Tech Open Office",
	origin: "official",
	layout: "builtin/tech-open-office",
	style: "builtin/pixel-classic",
	agentSkin: "builtin/tiny-developers",
	placements: [
		{ id: "dumbbell-1", component: "builtin/dumbbell", slot: "lounge-fitness-1" },
		{ id: "dumbbell-2", component: "builtin/dumbbell", slot: "lounge-fitness-2", orientation: "vertical" },
		{ id: "water-main", component: "builtin/water-cooler", slot: "lounge-service-1" },
		{ id: "plant-1", component: "builtin/plant", slot: "edge-decoration-left" },
		{ id: "plant-2", component: "builtin/plant", slot: "edge-decoration-middle" },
		{ id: "plant-3", component: "builtin/plant", slot: "edge-decoration-right" },
	],
	npcs: [
		{ id: "boss", template: "builtin/boss", name: "Boss", spawn: "boss-seat", pose: "sit" },
		{ id: "cleaner", template: "builtin/cleaner", name: "Lin", spawn: "cleaner-entry" },
	],
	activities: ["builtin/cleaning-round", "builtin/restroom-break"],
	atmosphere: "builtin/default-atmosphere",
	environment: "builtin/local-office-environment",
	environmentOverrides: {
		clock: { mode: "fixed", fixedTime: "10:30" },
		weather: { fallback: "clear" },
		npcSchedule: { roleOverrides: { cleaner: { start: "08:00", end: "17:00" } } },
	},
};
ok(validateOfficeSpec(base, library).valid, "valid base Office Spec was rejected");
ok(compileOfficeSpec(base, library).draft?.id === base.id, "official Office Spec did not pass the common compiler");
const validLayout = library.layouts.get(base.layout);
library.layouts.set(base.layout, { ...validLayout, canvas: { width: 1, height: 1 }, seats: [], navigation: { lanes: [] }, stations: {}, propInstances: [{ type: "missing-prop" }] });
const invalidLayoutIssues = validateOfficeSpec(base, library).issues;
ok(invalidLayoutIssues.some((issue) => issue.code === "invalid-layout-canvas"), "invalid layout canvas reached the browser validator");
ok(invalidLayoutIssues.some((issue) => issue.code === "invalid-layout-seats"), "invalid layout seats reached the browser validator");
ok(invalidLayoutIssues.some((issue) => issue.code === "invalid-layout-navigation"), "invalid layout navigation reached the browser validator");
ok(invalidLayoutIssues.some((issue) => issue.code === "missing-layout-station"), "missing layout stations reached the browser validator");
ok(invalidLayoutIssues.some((issue) => issue.code === "unknown-layout-prop"), "unknown layout prop reached the browser validator");
library.layouts.set(base.layout, validLayout);

const patch = {
	schemaVersion: 1,
	kind: "office-patch",
	base: base.id,
	name: "My Tech Office",
	components: { style: "builtin/warm-studio" },
	placements: {
		remove: ["plant-1", "missing-prop"],
		upsert: [{ id: "local-plant", component: "builtin/plant", slot: "edge-decoration-left" }],
	},
	npcs: { upsert: [{ id: "background-colleague" }, { id: "cleaner", appearance: { shirt: "#112233" } }] },
	activities: { enable: ["builtin/phone-break"], disable: ["builtin/restroom-break", "builtin/not-enabled"] },
	environmentOverrides: { clock: { mode: "local" }, weather: { fallback: "rain" }, npcSchedule: { defaultShift: { start: "09:00", end: "18:00" } } },
	agentProfile: { template: "builtin/host-agent", name: "Ada", title: "Tech Lead", appearance: { shirt: "#112233" } },
};
const first = compileOfficePatch(base, patch, library);
const second = compileOfficePatch(base, patch, library);
ok(first.errors.length === 0 && first.draft, "valid Patch did not compile");
ok(JSON.stringify(first.draft) === JSON.stringify(second.draft), "default NPC profile selection is not deterministic");
ok(first.draft.origin === "custom" && first.draft.basePreset === base.id, "compiled office lost its origin");
ok(first.draft.style === "builtin/warm-studio", "component override was not applied");
ok(first.draft.placements.some((entry) => entry.id === "local-plant") && !first.draft.placements.some((entry) => entry.id === "plant-1"), "placement operations were not applied");
const colleague = first.draft.npcs.find((entry) => entry.id === "background-colleague");
ok(colleague?.template === "builtin/colleague" && colleague.profile && colleague.name && colleague.gender && colleague.appearance && colleague.spawn && colleague.pose, "default NPC was not fully resolved");
ok(colleague.spawn !== "boss-seat", "background colleague was assigned to the executive seat");
const cleaner = first.draft.npcs.find((entry) => entry.id === "cleaner");
ok(cleaner?.appearance?.shirt === "#112233" && cleaner.appearance.skin, "partial NPC appearance update lost inherited fields");
ok(first.draft.activities.includes("builtin/phone-break") && !first.draft.activities.includes("builtin/restroom-break"), "activity operations were not applied");
ok(first.adjustments.filter((entry) => entry.code === "remove-missing" || entry.code === "disable-missing").length === 2, "safe ignored operations were not reported");
ok(first.draft.environmentOverrides?.clock?.mode === "local" && first.draft.environmentOverrides.clock.fixedTime === undefined, "local clock retained stale fixedTime");
ok(first.draft.environmentOverrides?.weather?.fallback === "rain", "environment weather patch was not applied");
ok(first.draft.environmentOverrides?.npcSchedule?.roleOverrides?.cleaner?.start === "08:00", "partial environment patch lost role shifts");
ok(first.draft.agentProfile?.name === "Ada" && first.draft.agentProfile.title === "Tech Lead" && first.draft.agentProfile.appearance?.shirt === "#112233", "Agent Profile override was not applied");

const invalidReference = compileOfficePatch(base, { schemaVersion: 1, kind: "office-patch", base: base.id, components: { style: "builtin/unknown" } }, library);
ok(!invalidReference.draft && invalidReference.errors.some((entry) => entry.code === "unknown-style"), "unknown component produced a draft");

const invalidShape = compileOfficePatch(base, { schemaVersion: 1, kind: "office-patch", base: base.id, script: "do anything" }, library);
ok(!invalidShape.draft && invalidShape.errors.some((entry) => entry.code === "invalid-patch-shape"), "unknown field produced a draft");

const wrongBase = compileOfficePatch(base, { schemaVersion: 1, kind: "office-patch", base: "builtin/other" }, library);
ok(!wrongBase.draft && wrongBase.errors.some((entry) => entry.code === "base-mismatch"), "base mismatch produced a draft");

const conflicting = compileOfficePatch(base, {
	schemaVersion: 1,
	kind: "office-patch",
	base: base.id,
	activities: { enable: ["builtin/get-water"], disable: ["builtin/get-water"] },
}, library);
ok(!conflicting.draft && conflicting.errors.some((entry) => entry.code === "conflicting-operation"), "conflicting activity operations produced a draft");

const manyNpcs = Array.from({ length: 20 }, (_, index) => ({ id: `colleague-${index}` }));
const truncated = compileOfficePatch(base, { schemaVersion: 1, kind: "office-patch", base: base.id, npcs: { upsert: manyNpcs } }, library);
ok(truncated.errors.length === 0 && truncated.draft?.npcs.length === 12, "NPC capacity was not applied safely");
ok(truncated.adjustments.some((entry) => entry.code === "capacity-truncated" && entry.path === "$.npcs"), "NPC capacity adjustment was not reported");

const badTime = compileOfficePatch(base, {
	schemaVersion: 1,
	kind: "office-patch",
	base: base.id,
	environmentOverrides: { clock: { mode: "fixed", fixedTime: "29:70" } },
}, library);
ok(!badTime.draft && badTime.errors.some((entry) => entry.code === "invalid-fixed-time"), "invalid fixed time produced a draft");

const unsafeIdentity = compileOfficePatch(base, {
	schemaVersion: 1,
	kind: "office-patch",
	base: base.id,
	id: "local/../../outside",
	npcs: { upsert: [{ id: "unsafe/npc", appearance: { shirt: "url(https://example.com/x)" } }] },
}, library);
ok(!unsafeIdentity.draft && unsafeIdentity.errors.some((entry) => entry.code === "invalid-office-id"), "unsafe office id produced a draft");
ok(unsafeIdentity.errors.some((entry) => entry.code === "invalid-npc-id"), "unsafe NPC id was accepted");
ok(unsafeIdentity.errors.some((entry) => entry.code === "invalid-color"), "unsafe appearance value was accepted");

console.log("Office compiler validation passed: deterministic defaults, patch operations, strict references, capacity handling, and no partial drafts");
