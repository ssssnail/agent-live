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
assert.equal(content.environment.clock.fixedTime, "21:30");
assert.equal(content.environment.weather.fallback, "rain");
assert.equal(content.agentProfile.name, "Ada");
assert.equal(content.agentProfile.appearance.shirt, "#112233");

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
console.log("runtime content: three official offices and one customized Office Spec compiled into renderable graphs");
