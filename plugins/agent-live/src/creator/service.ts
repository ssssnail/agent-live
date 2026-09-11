import { compileOfficePatch } from "../content/compiler.ts";
import type { OfficePatch, OfficeSpec } from "../content/schema.ts";
import type { ComponentLibraryView } from "../content/validator.ts";
import { OfficeRegistry } from "../content/registry.ts";

/**
 * What the selected Office's room offers: the zones a request can name, the
 * slots that exist and what they accept, who currently occupies them, and where
 * NPCs may spawn. This is model-facing context only; rooms are never a choice.
 */
function roomView(library: ComponentLibraryView, office: OfficeSpec) {
	const layout = library.layouts.get(office.layout);
	if (!layout) return null;
	const occupants = new Map<string, string | null>();
	for (const slot of layout.placementSlots ?? []) occupants.set(slot.id, slot.occupiedBy ?? null);
	for (const placement of office.placements) occupants.set(placement.slot, placement.id);
	return {
		name: layout.name,
		zones: (layout.zones ?? []).map((zone: any) => ({ id: zone.id, name: zone.name, x: zone.x, y: zone.y, width: zone.width, height: zone.height })),
		slots: (layout.placementSlots ?? []).map((slot: any) => ({ id: slot.id, zone: slot.zone, accepts: slot.accepts ?? [], maxSize: slot.maxSize, occupiedBy: occupants.get(slot.id) ?? null })),
		npcSpawns: layout.npcSpawns ?? [],
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
	async listComponents() {
		const office = await this.#registry.selected();
		return {
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
		const saved = await this.#registry.save(compiled.draft);
		if (!saved.saved) return { saved: false, errors: saved.issues, adjustments: compiled.adjustments };
		await this.#registry.select(compiled.draft.id);
		return { saved: true, office: structuredClone(compiled.draft), errors: [], adjustments: compiled.adjustments };
	}

}
