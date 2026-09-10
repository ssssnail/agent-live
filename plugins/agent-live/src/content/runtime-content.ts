import { readFile } from "node:fs/promises";
import path from "node:path";
import type { OfficeSpec } from "./schema.ts";
import type { ComponentLibraryView } from "./validator.ts";

const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const short = (id: string) => id.replace(/^builtin\//, "");

async function asset(contentRoot: string, family: string, id: string, suffix = "") {
	const name = suffix && short(id).endsWith(suffix) ? short(id).slice(0, -suffix.length) : short(id);
	return readJson(path.join(contentRoot, family, `${name}.json`));
}

/** Compiles a validated Office Spec into the renderer's current in-memory content graph. */
export async function resolveRuntimeContent(spec: OfficeSpec, contentRoot: string, library: ComponentLibraryView) {
	const layout = structuredClone(library.layouts.get(spec.layout));
	if (!layout) throw new Error(`unknown layout ${spec.layout}`);
	const officialId = short(spec.layout);
	const scaffold = await readJson(path.join(contentRoot, "presets", `${officialId}.json`));
	const [style, agentSkin, atmosphere, environment] = await Promise.all([
		asset(contentRoot, "styles", spec.style), asset(contentRoot, "agent-skins", spec.agentSkin),
		asset(contentRoot, "atmospheres", spec.atmosphere, "-atmosphere"), asset(contentRoot, "environments", spec.environment, "-environment"),
	]);

	const slottedIds = new Set((layout.placementSlots ?? []).map((slot: any) => slot.occupiedBy).filter(Boolean));
	for (const placement of spec.placements) slottedIds.add(placement.id);
	layout.propInstances = (layout.propInstances ?? []).filter((entry: any) => !slottedIds.has(entry.id));
	for (const placement of spec.placements) {
		const slot = layout.placementSlots.find((entry: any) => entry.id === placement.slot);
		layout.propInstances.push({ id: placement.id, type: short(placement.component), x: slot.x, y: slot.y, ...(placement.orientation ? { orientation: placement.orientation } : {}) });
	}

	const propTypes = Object.fromEntries([...library.props.values()].map((entry: any) => [short(entry.id), { size: entry.size, capabilities: entry.capabilities, renderer: entry.renderer }]));
	const props = { schemaVersion: 1, kind: "props", id: `local/${short(spec.id)}-props`, name: `${spec.name} props`, version: "1.0.0", contract: "single-office-v1", types: propTypes };
	const npcs = {
		schemaVersion: 1, kind: "npcs", id: `local/${short(spec.id)}-npcs`, name: `${spec.name} NPCs`, version: "1.0.0", contract: "single-office-v1",
		entries: spec.npcs.map((npc) => ({ ...structuredClone(npc), role: library.npcTemplates.get(npc.template!)?.role })),
	};
	const entries = spec.activities.map((id) => {
		const implementation = library.activityImplementations.get(`${spec.layout}|${id}`);
		if (!implementation) throw new Error(`activity ${id} has no implementation compatible with ${spec.layout}`);
		return structuredClone(implementation.definition);
	});
	const lifeActivities = { schemaVersion: 1, kind: "life-activities", id: `local/${short(spec.id)}-activities`, name: `${spec.name} activities`, version: "1.0.0", contract: "single-office-v1", entries };
	const agentProfileTemplate = library.agentProfileTemplates.get(spec.agentProfile?.template ?? "builtin/host-agent");
	const agentProfile = {
		template: agentProfileTemplate?.id ?? "builtin/host-agent",
		...(spec.agentProfile?.name ? { name: spec.agentProfile.name } : {}),
		...(spec.agentProfile?.title ? { title: spec.agentProfile.title } : {}),
		appearance: { ...(agentProfileTemplate?.defaultAppearance ?? {}), ...(spec.agentProfile?.appearance ?? {}) },
	};
	if (spec.environmentOverrides?.clock) environment.clock = { ...environment.clock, ...spec.environmentOverrides.clock };
	if (spec.environmentOverrides?.weather) environment.weather = { ...environment.weather, ...spec.environmentOverrides.weather };
	if (spec.environmentOverrides?.lighting) environment.lighting = { ...environment.lighting, enabled: spec.environmentOverrides.lighting.auto };
	if (spec.environmentOverrides?.npcSchedule) environment.npcSchedule = {
		...environment.npcSchedule, ...spec.environmentOverrides.npcSchedule,
		roleOverrides: { ...(environment.npcSchedule?.roleOverrides ?? {}), ...(spec.environmentOverrides.npcSchedule.roleOverrides ?? {}) },
	};
	const preset: Record<string, unknown> = { ...scaffold, id: spec.id, name: spec.name, officeSpec: spec.id };
	// Session events must be losslessly JSON-serializable, so no `undefined` placeholder survives here.
	delete preset.content;
	return {
		preset,
		style, layout, agentSkin, agentProfile, props, npcs, lifeActivities, atmosphere, environment,
	};
}
