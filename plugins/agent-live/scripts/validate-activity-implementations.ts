import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/v2/content");
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const presets = [];
for (const file of await readdir(path.join(contentRoot, "presets"))) if (file.endsWith(".json")) presets.push(await readJson(path.join(contentRoot, "presets", file)));
const entries = new Map<string, any>();
for (const preset of presets) {
	const layout = `builtin/${preset.content.layout}`;
	const bundle = await readJson(path.join(contentRoot, "life-activities", `${preset.content.lifeActivities}.json`));
	for (const definition of bundle.entries ?? []) {
		const key = `${layout}|builtin/${definition.id}`;
		const value = { layout, recipe: `builtin/${definition.id}`, definition };
		const previous = entries.get(key);
		if (previous && JSON.stringify(previous) !== JSON.stringify(value)) throw new Error(`conflicting activity implementation ${key}`);
		entries.set(key, value);
	}
}
const destination = path.join(contentRoot, "component-library/activity-implementations.json");
const actual = await readJson(destination);
assert.equal(actual.kind, "activity-implementation-library");
assert.deepEqual(actual.entries, [...entries.values()].sort((a, b) => `${a.layout}|${a.recipe}`.localeCompare(`${b.layout}|${b.recipe}`)), "component activity implementations and legacy fallback bundles differ");
console.log(`activity implementations: ${entries.size} authoritative entries cover all legacy fallback bundles`);
