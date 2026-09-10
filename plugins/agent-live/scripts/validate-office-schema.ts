import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	GENDER_VALUES,
	OFFICE_SPEC_DEFAULTS,
	validateOfficePatchShape,
	validateOfficeSeedShape,
	validateOfficeSpecShape,
} from "../src/content/schema.ts";

function ok(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

const spec = {
	schemaVersion: 1,
	kind: "office-spec",
	id: "local/night-tech",
	name: "Night Tech",
	origin: "custom",
	basePreset: "builtin/tech-open-office",
	layout: "builtin/tech-open-office",
	style: OFFICE_SPEC_DEFAULTS.style,
	agentSkin: OFFICE_SPEC_DEFAULTS.agentSkin,
	placements: [{ id: "plant-local", component: "builtin/plant", slot: "edge-decoration-left" }],
	npcs: [{ id: "colleague-1", gender: "female", shift: { start: "09:00", end: "18:00" } }],
	activities: ["builtin/get-water"],
	atmosphere: OFFICE_SPEC_DEFAULTS.atmosphere,
	environment: OFFICE_SPEC_DEFAULTS.environment,
	environmentOverrides: {
		weather: { fallback: "rain" },
		lighting: { auto: true },
		npcSchedule: { defaultShift: { start: "09:00", end: "18:00" } },
	},
};
ok(validateOfficeSpecShape(spec).length === 0, "valid Office Spec was rejected");

const patch = {
	schemaVersion: 1,
	kind: "office-patch",
	base: "builtin/tech-open-office",
	name: "My Office",
	components: { style: "builtin/warm-studio" },
	placements: { upsert: [{ id: "plant-local", component: "builtin/plant", slot: "edge-decoration-left" }], remove: ["old-plant"] },
	npcs: { upsert: [{ id: "colleague-1", name: "Robin", gender: "nonbinary" }], remove: ["old-colleague"] },
	activities: { enable: ["builtin/get-water"], disable: ["builtin/phone-break"] },
	environmentOverrides: { clock: { mode: "local" } },
	agentProfile: { template: "builtin/host-agent", name: "Ada", title: "Tech Lead", appearance: { shirt: "#112233" } },
};
ok(validateOfficePatchShape(patch).length === 0, "valid Office Patch was rejected");
const seed = { schemaVersion: 1, kind: "office-seed", id: "local/blank-office", name: "Blank Office", layout: "builtin/lively-office" };
ok(validateOfficeSeedShape(seed).length === 0, "valid Office Seed was rejected");
ok(validateOfficeSeedShape({ ...seed, x: 10 }).some((entry) => entry.path === "$.x"), "arbitrary Office Seed field was accepted");

const unknownField = validateOfficePatchShape({ ...patch, javascript: "alert(1)" });
ok(unknownField.some((entry) => entry.path === "$.javascript" && entry.message === "unknown field"), "unknown Patch field was accepted");

const arbitraryCoordinates = validateOfficePatchShape({
	...patch,
	placements: { upsert: [{ id: "plant", component: "builtin/plant", slot: "edge-decoration-left", x: 100, y: 100 }] },
});
ok(arbitraryCoordinates.some((entry) => entry.path === "$.placements.upsert[0].x"), "arbitrary placement coordinates were accepted");

const invalidEnums = validateOfficePatchShape({
	...patch,
	npcs: { upsert: [{ id: "npc", gender: "robot", pose: "dance" }] },
	environmentOverrides: { weather: { fallback: "thunderstorm" } },
});
ok(invalidEnums.some((entry) => entry.path === "$.npcs.upsert[0].gender"), "invalid gender was accepted");
ok(invalidEnums.some((entry) => entry.path === "$.npcs.upsert[0].pose"), "invalid pose was accepted");
ok(invalidEnums.some((entry) => entry.path === "$.environmentOverrides.weather.fallback"), "invalid weather was accepted");

const missingRequired = validateOfficeSpecShape({ ...spec, layout: undefined, placements: undefined });
ok(missingRequired.some((entry) => entry.path === "$.layout"), "missing Spec layout was accepted");
ok(missingRequired.some((entry) => entry.path === "$.placements"), "missing Spec placements were accepted");

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "v2", "content");
const npcLibrary = JSON.parse(fs.readFileSync(path.join(contentRoot, "component-library", "npc-templates.json"), "utf8"));
ok(JSON.stringify(npcLibrary.genderValues) === JSON.stringify(GENDER_VALUES), "NPC library and Office Schema gender enums diverged");

console.log("Office schema validation passed: valid Spec/Patch/Seed, defaults, strict fields, coordinate rejection, and enums");
