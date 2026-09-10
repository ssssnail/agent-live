import { compileOfficePatch, compileOfficeSeed } from "../content/compiler.ts";
import type { OfficePatch } from "../content/schema.ts";
import type { ComponentLibraryView } from "../content/validator.ts";
import { OfficeRegistry } from "../content/registry.ts";

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

	async createFromLayout(layout: string, name: string) {
		const id = `local/layout-${layout.replace(/^builtin\//, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}`;
		const existing = await this.#registry.get(id);
		if (existing) {
			await this.#registry.select(id);
			return { saved: true as const, office: existing };
		}
		const compiled = compileOfficeSeed({ schemaVersion: 1, kind: "office-seed", id, name, layout }, this.#library);
		if (!compiled.draft) return { saved: false as const, errors: compiled.errors };
		const saved = await this.#registry.save(compiled.draft);
		if (!saved.saved) return { saved: false as const, errors: saved.issues };
		await this.#registry.select(id);
		return { saved: true as const, office: compiled.draft };
	}

	listComponents() {
		return {
			layouts: this.#library.descriptors.layouts.map((entry) => ({ ...entry, zones: this.#library.layouts.get(entry.id)?.zones ?? [], placementSlots: this.#library.layouts.get(entry.id)?.placementSlots ?? [], npcSpawns: this.#library.layouts.get(entry.id)?.npcSpawns ?? [] })),
			styles: structuredClone(this.#library.descriptors.styles),
			agentSkins: structuredClone(this.#library.descriptors.agentSkins),
			props: structuredClone([...this.#library.props.values()]),
			npcTemplates: structuredClone([...this.#library.npcTemplates.values()]),
			agentProfileTemplates: structuredClone([...this.#library.agentProfileTemplates.values()]),
			activities: [...this.#library.activityRecipes.values()].map((entry) => ({ ...structuredClone(entry), layouts: [...this.#library.activityImplementations.values()].filter((implementation) => implementation.recipe === entry.id).map((implementation) => implementation.layout) })),
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
