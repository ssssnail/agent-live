import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileOfficePatch, compileOfficeSeed } from "../src/content/compiler.ts";
import { loadComponentLibrary, loadOfficialOffices } from "../src/content/library.ts";
import { resolveRuntimeContent } from "../src/content/runtime-content.ts";
import { graphIssues, validateRegistry } from "../web/v2/graph-validator.js";
import { validateOfficeSpec } from "../src/content/validator.ts";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/v2/content");
const library = await loadComponentLibrary(contentRoot);
const offices = await loadOfficialOffices(contentRoot);
for (const office of offices) {
	const content = await resolveRuntimeContent(office, contentRoot, library);
	assert.doesNotThrow(() => validateRegistry(content), `${office.id} must pass the browser content validator`);
	assert.equal(content.layout.id, office.layout);
	assert.equal(content.npcs.entries.length, office.npcs.length);
	if (office.npcs.some((npc: any) => npc.template === "builtin/colleague")) {
		assert.equal(content.lifeActivities.entries.some((activity: any) => activity.id === "colleague-chat"), true, "background colleagues must receive their default social activity");
		assert.equal(content.lifeActivities.entries.some((activity: any) => activity.id === "restroom-break"), true, "background colleagues must receive their default break activity");
	}
	assert.deepEqual(content.lifeActivities.entries.map((entry: any) => `builtin/${entry.id}`), office.activities);
}
for (const layout of library.layouts.keys()) {
	const blank = compileOfficeSeed({ schemaVersion: 1, kind: "office-seed", id: `local/blank-${layout.replace(/^builtin\//, "")}`, name: "Blank Office", layout }, library);
	assert.ok(blank.draft);
	const graph = await resolveRuntimeContent(blank.draft, contentRoot, library);
	assert.doesNotThrow(() => validateRegistry(graph), `${layout} blank office must pass the browser content validator`);
	assert.equal(graph.layout.id, layout);
	assert.equal(graph.npcs.entries.length, 0);
	assert.equal(graph.lifeActivities.entries.length, 0);
}
const base = offices.find((office) => office.id === "builtin/tech-open-office")!;
const result = compileOfficePatch(base, {
	schemaVersion: 1, kind: "office-patch", base: base.id, id: "local/runtime-preview", name: "Runtime Preview",
	placements: { remove: ["plant-1"], upsert: [{ id: "replacement-plant", component: "builtin/plant", slot: "edge-decoration-left" }] },
	npcs: { upsert: [{ id: "new-colleague" }] }, activities: { enable: ["builtin/phone-break"] },
	environmentOverrides: { clock: { mode: "fixed", fixedTime: "21:30" }, weather: { fallback: "rain" }, lighting: { auto: true } },
	agentProfile: { template: "builtin/host-agent", name: "Ada", title: "Tech Lead", appearance: { shirt: "#112233" } },
}, library);
assert.ok(result.draft);
const content = await resolveRuntimeContent(result.draft, contentRoot, library);
assert.doesNotThrow(() => validateRegistry(content), "custom office must pass the browser content validator");
assert.equal(content.layout.propInstances.some((entry: any) => entry.id === "plant-1"), false);
assert.equal(content.layout.propInstances.some((entry: any) => entry.id === "replacement-plant" && entry.x === 16 && entry.y === 200), true);
assert.equal(content.npcs.entries.find((entry: any) => entry.id === "new-colleague")?.role, "colleague");
assert.equal(content.lifeActivities.entries.some((activity: any) => activity.id === "colleague-chat" && activity.participant.kind === "person"), true);
assert.equal(content.lifeActivities.entries.some((activity: any) => activity.id === "outside-walk" && activity.participant.kind === "person"), true);
assert.equal(content.lifeActivities.entries.some((activity: any) => activity.id === "phone-break" && activity.participant.kind === "person"), true);
assert.equal(content.lifeActivities.entries.some((activity: any) => activity.id === "restroom-break" && activity.participant.kind === "person"), true);
assert.equal(content.environment.clock.fixedTime, "21:30");
assert.equal(content.environment.weather.fallback, "rain");
assert.equal(content.agentProfile.name, "Ada");
assert.equal(content.agentProfile.appearance.shirt, "#112233");

// Disabling a routine must survive until the graph is served. NPC template
// defaults are already part of the saved spec, so unioning them while serving
// used to bring every disabled routine back (an Office that saved 3 routines
// served 9).
const trimmed = compileOfficePatch(result.draft, {
	schemaVersion: 1, kind: "office-patch", base: result.draft.id,
	activities: { disable: ["builtin/colleague-chat", "builtin/outside-walk", "builtin/phone-break", "builtin/restroom-break", "builtin/boss-cheer-round", "builtin/plant-watering"] },
}, library);
assert.ok(trimmed.draft, "disabling routines must still compile");
const trimmedGraph = await resolveRuntimeContent(trimmed.draft, contentRoot, library);
assert.deepEqual(
	trimmedGraph.lifeActivities.entries.map((entry: any) => `builtin/${entry.id}`).sort(),
	[...trimmed.draft.activities].sort(),
	"the served routines must be exactly the saved ones",
);
for (const disabled of ["colleague-chat", "plant-watering", "boss-cheer-round"]) {
	assert.equal(trimmedGraph.lifeActivities.entries.some((entry: any) => entry.id === disabled), false, `${disabled} must stay disabled while the graph is served`);
}

// A layout the browser would refuse must also be refused when saving.
const structureLibrary = { ...library, layouts: new Map(library.layouts) };
const techLayout = library.layouts.get("builtin/tech-open-office");
structureLibrary.layouts.set("builtin/tech-open-office", { ...techLayout, navigation: { ...techLayout.navigation, lanes: [] } });
const rejected = validateOfficeSpec(base, structureLibrary);
assert.equal(rejected.valid, false, "a layout without navigation lanes must be rejected server-side");
assert.ok(rejected.issues.some((issue) => issue.code === "invalid-layout-navigation"), "the shared layout rule must report the navigation problem");

// Serving uses the same rules the browser applies.
assert.deepEqual(graphIssues(content), [], "a renderable graph must report no issues");
const brokenGraph = structuredClone(content);
brokenGraph.layout.navigation.lanes = [];
assert.ok(graphIssues(brokenGraph).length > 0, "an unrenderable graph must be rejected before it is served");

// Every requirement produces a binding, so the compiled decision is inspectable.
for (const entry of content.lifeActivities.entries as any[]) {
	assert.equal(entry.bindings?.length, (entry.requires ?? []).length, `${entry.id} must expose one binding per requirement`);
}

// Capability requirements resolve against the props actually present.
const CAPABILITY_KEY = "builtin/tech-open-office|builtin/boss-water-break";
const capabilityLibrary = { ...library, activityImplementations: new Map(library.activityImplementations) };
const waterImplementation = library.activityImplementations.get(CAPABILITY_KEY);
capabilityLibrary.activityImplementations.set(CAPABILITY_KEY, {
	...waterImplementation,
	definition: { ...waterImplementation.definition, requires: [{ capability: "water" }] },
});
assert.ok(validateOfficeSpec(base, capabilityLibrary).valid, "a capability this office provides must satisfy the requirement");
const withoutWater = compileOfficePatch(base, {
	schemaVersion: 1, kind: "office-patch", base: base.id,
	placements: { upsert: [{ id: "water-main", component: "builtin/vending-machine", slot: "lounge-service-1" }] },
}, capabilityLibrary);
assert.equal(withoutWater.draft, undefined, "swapping the water source must stop satisfying a water requirement");
assert.ok(withoutWater.errors.some((issue) => issue.code === "missing-activity-capability"), "the failure must name the missing capability");
const removedWater = compileOfficePatch(base, {
	schemaVersion: 1, kind: "office-patch", base: base.id,
	placements: { remove: ["water-main"] },
}, capabilityLibrary);
assert.equal(removedWater.draft, undefined, "a removed fixture must not satisfy an active routine");
const signed = compileOfficePatch(base, {
	schemaVersion: 1, kind: "office-patch", base: base.id,
	texts: { company: "Snail Lab", notice: "Welcome", slogan: "Build together" },
}, library);
assert.ok(signed.draft);
const signedGraph = await resolveRuntimeContent(signed.draft, contentRoot, library);
assert.deepEqual(graphIssues(signedGraph), []);
assert.equal(signedGraph.layout.textSlots.find((slot: any) => slot.id === "company").text, "Snail Lab");

// The shared module enforces the same rule where the graph is consumed.
const capabilityGraph = structuredClone(content);
capabilityGraph.lifeActivities.entries[0].requires = [{ capability: "water" }];
assert.deepEqual(graphIssues(capabilityGraph), [], "the graph must resolve a capability its props provide");
capabilityGraph.lifeActivities.entries[0].requires = [{ capability: "teleport" }];
assert.ok(graphIssues(capabilityGraph).some((issue) => issue.code === "missing-activity-capability"), "the graph must reject an unsatisfiable capability");

console.log("runtime content: three official offices and one customized Office Spec compiled into renderable graphs");
