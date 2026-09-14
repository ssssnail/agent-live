import { compileOfficePatch, patchOfficeId } from "../content/compiler.ts";
import type { OfficePatch, OfficeSpec } from "../content/schema.ts";
import type { ComponentLibraryView } from "../content/validator.ts";
import { OfficeRegistry } from "../content/registry.ts";

export const COMPONENT_CATEGORIES = ["summary", "room", "npcs", "props", "activities", "appearance", "environment", "all"] as const;
export type ComponentCategory = typeof COMPONENT_CATEGORIES[number];

/**
 * What the selected Office's room offers: the zones a request can name, the
 * slots that exist and what they accept, who currently occupies them, and where
 * NPCs may spawn. This is model-facing context only; rooms are never a choice.
 */
function roomView(library: ComponentLibraryView, office: OfficeSpec) {
	const layout = library.layouts.get(office.layout);
	if (!layout) return null;
	const occupants = new Map<string, string | null>();
	for (const slot of layout.placementSlots ?? []) occupants.set(slot.id, null);
	for (const placement of office.placements) occupants.set(placement.slot, placement.id);
	return {
		name: layout.name,
		zones: (layout.zones ?? []).map((zone: any) => ({ id: zone.id, name: zone.name, x: zone.x, y: zone.y, width: zone.width, height: zone.height })),
		slots: (layout.placementSlots ?? []).map((slot: any) => ({ id: slot.id, zone: slot.zone, accepts: slot.accepts ?? [], maxSize: slot.maxSize, occupiedBy: occupants.get(slot.id) ?? null })),
		npcSpawns: layout.npcSpawns ?? [],
		textSlots: (layout.textSlots ?? []).map((slot: any) => ({ id: slot.id, name: slot.name, maxLength: slot.maxLength, text: office.texts?.[slot.id] ?? slot.defaultText ?? "" })),
		placements: office.placements.map((placement) => ({ id: placement.id, component: placement.component, slot: placement.slot, ...(placement.orientation ? { orientation: placement.orientation } : {}) })),
	};
}

export class CreatorService {
	readonly #registry: OfficeRegistry;
	readonly #library: ComponentLibraryView;

	constructor(registry: OfficeRegistry, library: ComponentLibraryView) {
		this.#registry = registry;
		this.#library = library;
	}

	async listOffices() { return this.#registry.list(); }

	async selectOffice(id: string) {
		const office = await this.#registry.get(id);
		if (!office) return { selected: false as const, error: `unknown or invalid office ${id}` };
		await this.#registry.select(id);
		return { selected: true as const, office };
	}

	/**
	 * Capabilities the model may map a request onto. `room` describes the room of
	 * the currently selected Office only — zones, placement slots and NPC spawns —
	 * because "add a plant" or "put a water cooler in the lounge" is only reliable
	 * when the model can see what this Office actually offers. Rooms are never
	 * presented as a choice.
	 */
	async listComponents(category: ComponentCategory = "summary") {
		const office = await this.#registry.selected();
		const full = {
			room: roomView(this.#library, office),
			styles: structuredClone(this.#library.descriptors.styles),
			agentSkins: structuredClone(this.#library.descriptors.agentSkins),
			props: structuredClone([...this.#library.props.values()]),
			npcTemplates: structuredClone([...this.#library.npcTemplates.values()]),
			agentProfileTemplates: structuredClone([...this.#library.agentProfileTemplates.values()]),
			activities: [...this.#library.activityRecipes.values()].map((entry) => ({ ...structuredClone(entry), rooms: [...this.#library.activityImplementations.values()].filter((implementation) => implementation.recipe === entry.id).map((implementation) => implementation.layout) })),
			atmospheres: structuredClone(this.#library.descriptors.atmospheres),
			environments: structuredClone(this.#library.descriptors.environments),
		};
		if (category === "all") return full;
		if (category === "room") return { room: full.room };
		if (category === "npcs") return { npcTemplates: full.npcTemplates };
		if (category === "props") return { room: full.room, props: full.props };
		if (category === "activities") return { activities: full.activities };
		if (category === "appearance") return { styles: full.styles, agentSkins: full.agentSkins, agentProfileTemplates: full.agentProfileTemplates };
		if (category === "environment") return { atmospheres: full.atmospheres, environments: full.environments };
		return {
			// The compact view is also the model's edit baseline. Supplying the
			// bounded, user-editable state here avoids filesystem inspection and
			// repeated catalog calls just to discover an NPC id or text slot.
			office: {
				id: office.id,
				name: office.name,
				origin: office.origin,
				agentProfile: structuredClone(office.agentProfile ?? null),
				texts: structuredClone(office.texts ?? {}),
				npcs: office.npcs.map((npc) => ({
					id: npc.id,
					template: npc.template,
					name: npc.name,
					title: npc.title,
					gender: npc.gender,
					spawn: npc.spawn,
				})),
			},
			counts: {
				styles: full.styles.length,
				agentSkins: full.agentSkins.length,
				props: full.props.length,
				npcTemplates: full.npcTemplates.length,
				activities: full.activities.length,
				atmospheres: full.atmospheres.length,
				environments: full.environments.length,
			},
			categories: COMPONENT_CATEGORIES.filter((entry) => entry !== "summary"),
		};
	}

	/** Validate, persist and select one customization without exposing draft state. */
	async customize(patchInput: unknown, baseOffice?: string) {
		if (!patchInput || typeof patchInput !== "object" || Array.isArray(patchInput)) {
			return { saved: false, errors: [{ code: "invalid-patch-shape", path: "$", message: "patch must be an object" }], adjustments: [] };
		}
		const base = baseOffice ? await this.#registry.get(baseOffice) : await this.#registry.selected();
		if (!base) return { saved: false, errors: [{ code: "unknown-base", path: "$.base", message: `unknown or invalid base office ${baseOffice}` }], adjustments: [] };
		const patch = {
			...(patchInput as Record<string, unknown>),
			schemaVersion: 1,
			kind: "office-patch",
			base: base.id,
		} as OfficePatch;
		const compiled = compileOfficePatch(base, patch, this.#library);
		if (!compiled.draft) return { saved: false, errors: compiled.errors, adjustments: compiled.adjustments };
		// A patch may name the Office it creates, but it must never resolve onto a
		// different Office that already exists: that would overwrite it silently,
		// and the model cannot see which Office it just destroyed.
		if (compiled.draft.id !== patchOfficeId(base) && await this.#registry.get(compiled.draft.id)) {
			return {
				saved: false,
				errors: [{ code: "id-conflict", path: "$.id", message: `${compiled.draft.id} already exists; a patch cannot overwrite another Office` }],
				adjustments: compiled.adjustments,
			};
		}
		const saved = await this.#registry.save(compiled.draft);
		if (!saved.saved) return { saved: false, errors: saved.issues, adjustments: compiled.adjustments };
		await this.#registry.select(compiled.draft.id);
		return { saved: true, office: structuredClone(compiled.draft), errors: [], adjustments: compiled.adjustments };
	}

}
