import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ComponentLibraryView } from "./validator.ts";

async function readJson(file: string) {
	return JSON.parse(await readFile(file, "utf8"));
}

export async function loadComponentLibrary(contentRoot: string): Promise<ComponentLibraryView> {
	const root = path.join(contentRoot, "component-library");
	const [catalog, props, npcTemplates, agentProfileTemplates, activityRecipes, activityImplementations] = await Promise.all([
		readJson(path.join(root, "catalog.json")),
		readJson(path.join(root, "props.json")),
		readJson(path.join(root, "npc-templates.json")),
		readJson(path.join(root, "agent-profile-templates.json")),
		readJson(path.join(root, "activity-recipes.json")),
		readJson(path.join(root, "activity-implementations.json")),
	]);
	const layouts = new Map<string, any>();
	for (const entry of catalog.layouts) layouts.set(entry.id, await readJson(path.join(contentRoot, "layouts", `${entry.id.replace(/^builtin\//, "")}.json`)));
	return {
		descriptors: {
			styles: catalog.styles,
			layouts: catalog.layouts,
			agentSkins: catalog.agentSkins,
			atmospheres: catalog.atmospheres,
			environments: catalog.environments,
		},
		styles: new Set(catalog.styles.map((entry: any) => entry.id)), layouts,
		agentSkins: new Set(catalog.agentSkins.map((entry: any) => entry.id)),
		props: new Map(props.entries.map((entry: any) => [entry.id, entry])),
		npcTemplates: new Map(npcTemplates.entries.map((entry: any) => [entry.id, entry])),
		agentProfileTemplates: new Map(agentProfileTemplates.entries.map((entry: any) => [entry.id, entry])),
		activityRecipes: new Map(activityRecipes.entries.map((entry: any) => [entry.id, entry])),
		activityImplementations: new Map(activityImplementations.entries.map((entry: any) => [`${entry.layout}|${entry.recipe}`, entry])),
		atmospheres: new Set(catalog.atmospheres.map((entry: any) => entry.id)),
		environments: new Set(catalog.environments.map((entry: any) => entry.id)),
		defaultNpcTemplate: npcTemplates.defaultTemplate,
		npcProfilePolicy: npcTemplates.defaultInstancePolicy,
	};
}

export async function loadOfficialOffices(contentRoot: string) {
	const catalog = await readJson(path.join(contentRoot, "catalog.json"));
	const publicIds = catalog.presets.filter((entry: any) => entry.visibility !== "internal").map((entry: any) => entry.id);
	return Promise.all(publicIds.map((id: string) => readJson(path.join(contentRoot, "official-offices", `${id}.json`))));
}
