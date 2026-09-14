import { SCENE_LIMITS } from "../core/limits.ts";
import {
	OFFICE_SPEC_SCHEMA_VERSION,
	OFFICE_SPEC_DEFAULTS,
	type OfficeNpc,
	type OfficePatch,
	type OfficePlacement,
	type OfficeSeed,
	type OfficeSpec,
	validateOfficePatchShape,
	validateOfficeSeedShape,
} from "./schema.ts";
import { validateOfficeSpec, type ComponentLibraryView, type ValidationIssue } from "./validator.ts";

export interface CompileAdjustment {
	code: string;
	path: string;
	message: string;
}

export interface CompileResult {
	draft?: OfficeSpec;
	errors: ValidationIssue[];
	adjustments: CompileAdjustment[];
}

/** The common compilation gate used by both Official and Custom Office Specs. */
export function compileOfficeSpec(input: unknown, library: ComponentLibraryView): CompileResult {
	const validation = validateOfficeSpec(input, library);
	if (!validation.valid) return { errors: validation.issues, adjustments: [] };
	return { draft: structuredClone(input as OfficeSpec), errors: [], adjustments: [] };
}

/**
 * Creates the smallest valid custom office around a registered room.
 * Internal primitive: Creator never starts from an empty room, it edits the
 * Preset Office that already owns the room (see CreatorService.customize).
 */
export function compileOfficeSeed(input: unknown, library: ComponentLibraryView): CompileResult {
	const shapeIssues = validateOfficeSeedShape(input).map((entry) => ({ ...entry, code: "invalid-seed-shape" }));
	if (shapeIssues.length) return { errors: shapeIssues, adjustments: [] };
	const seed = input as OfficeSeed;
	const draft: OfficeSpec = {
		schemaVersion: OFFICE_SPEC_SCHEMA_VERSION,
		kind: "office-spec",
		id: seed.id,
		name: seed.name,
		origin: "custom",
		layout: seed.layout,
		style: seed.style ?? OFFICE_SPEC_DEFAULTS.style,
		agentSkin: seed.agentSkin ?? OFFICE_SPEC_DEFAULTS.agentSkin,
		placements: [],
		npcs: [],
		activities: [],
		atmosphere: seed.atmosphere ?? OFFICE_SPEC_DEFAULTS.atmosphere,
		environment: seed.environment ?? OFFICE_SPEC_DEFAULTS.environment,
		agentProfile: structuredClone(seed.agentProfile ?? OFFICE_SPEC_DEFAULTS.agentProfile),
	};
	return compileOfficeSpec(draft, library);
}

function hash(value: string) {
	let result = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		result ^= value.charCodeAt(index);
		result = Math.imul(result, 16777619);
	}
	return result >>> 0;
}

function upsertById<T extends { id: string }>(base: T[], updates: T[], removals: string[], path: string, adjustments: CompileAdjustment[], merge: (previous: T | undefined, update: T) => T = (previous, update) => ({ ...(previous ?? {}), ...structuredClone(update) } as T)) {
	const values = new Map(base.map((entry) => [entry.id, structuredClone(entry)]));
	for (const id of removals) {
		if (!values.delete(id)) adjustments.push({ code: "remove-missing", path, message: `${id} did not exist and was ignored` });
	}
	for (const update of updates) values.set(update.id, merge(values.get(update.id), update));
	return [...values.values()];
}

function truncate<T>(values: T[], maximum: number, path: string, adjustments: CompileAdjustment[]) {
	if (values.length <= maximum) return values;
	adjustments.push({ code: "capacity-truncated", path, message: `${values.length - maximum} extra item(s) were ignored; maximum is ${maximum}` });
	return values.slice(0, maximum);
}

function resolveNpc(npc: OfficeNpc, library: ComponentLibraryView, layout: any): OfficeNpc {
	const templateId = npc.template ?? library.defaultNpcTemplate;
	const template = library.npcTemplates.get(templateId);
	if (!template) return { ...npc, template: templateId };
	const profiles = template.defaultProfiles ?? [];
	const selected = npc.profile ? profiles.find((profile: any) => profile.id === npc.profile) : profiles.length ? profiles[hash(npc.id) % profiles.length] : undefined;
	const role = template.role;
	const spawnCandidates = (layout.npcSpawns ?? []).filter((spawn: string) => {
		if (role === "boss") return /boss|director|manager/.test(spawn);
		if (role === "cleaner") return /clean|service|staff|entry/.test(spawn) && !/boss/.test(spawn);
		if (role === "receptionist") return /reception|staff|entry/.test(spawn) && !/boss/.test(spawn);
		if (role === "secretary" || role === "attendant") return /secretary|service|staff|entry/.test(spawn) && !/boss/.test(spawn);
		return /staff|entry/.test(spawn) && !/boss|clean|service|reception|secretary/.test(spawn);
	});
	const requestedSpawn = npc.spawn;
	const requestedIsRoleSafe = requestedSpawn && (spawnCandidates.includes(requestedSpawn) || role !== "colleague");
	const fallbackSpawn = spawnCandidates[hash(`${npc.id}:spawn`) % Math.max(1, spawnCandidates.length)]
		?? layout.npcSpawns?.[hash(`${npc.id}:spawn`) % Math.max(1, layout.npcSpawns?.length ?? 0)];
	return {
		id: npc.id,
		template: templateId,
		...(selected?.id ? { profile: selected.id } : {}),
		name: npc.name ?? selected?.name ?? template.name,
		title: npc.title ?? template.defaultTitle,
		gender: npc.gender ?? selected?.gender ?? template.defaultGender,
		appearance: { ...template.defaultAppearance, ...(selected?.appearance ?? {}), ...(npc.appearance ?? {}) },
		spawn: requestedIsRoleSafe ? requestedSpawn : fallbackSpawn,
		...(npc.shift ? { shift: structuredClone(npc.shift) } : {}),
		pose: npc.pose ?? template.defaultPose,
	};
}

function mergeNpc(previous: OfficeNpc | undefined, update: OfficeNpc): OfficeNpc {
	return {
		...(previous ?? {}),
		...structuredClone(update),
		...(previous?.appearance || update.appearance ? { appearance: { ...(previous?.appearance ?? {}), ...(update.appearance ?? {}) } } : {}),
		...(previous?.shift || update.shift ? { shift: { ...(previous?.shift ?? {}), ...(update.shift ?? {}) } as OfficeNpc["shift"] } : {}),
	} as OfficeNpc;
}

function mergeEnvironment(base: OfficeSpec["environmentOverrides"], patch: NonNullable<OfficePatch["environmentOverrides"]>) {
	const clock = patch.clock ? { ...(base?.clock ?? {}), ...patch.clock } : base?.clock;
	if (clock?.mode === "local") delete clock.fixedTime;
	const npcSchedule = patch.npcSchedule
		? {
			...(base?.npcSchedule ?? {}),
			...patch.npcSchedule,
			roleOverrides: { ...(base?.npcSchedule?.roleOverrides ?? {}), ...(patch.npcSchedule.roleOverrides ?? {}) },
		}
		: base?.npcSchedule;
	return {
		...(clock ? { clock } : {}),
		...(patch.weather || base?.weather ? { weather: { ...(base?.weather ?? {}), ...(patch.weather ?? {}) } as NonNullable<typeof base>["weather"] } : {}),
		...(patch.lighting || base?.lighting ? { lighting: { ...(base?.lighting ?? {}), ...(patch.lighting ?? {}) } as NonNullable<typeof base>["lighting"] } : {}),
		...(npcSchedule ? { npcSchedule } : {}),
	};
}

function duplicates(values: string[]) {
	const seen = new Set<string>();
	return values.filter((value) => seen.has(value) || !seen.add(value));
}

/**
 * The id a patch targets when it does not name one: a Custom Office keeps its
 * identity, a Preset Office is copied into its single editable local Office.
 */
export function patchOfficeId(base: OfficeSpec): string {
	return base.origin === "custom" ? base.id : `local/${base.id.replace(/^builtin\//, "")}`;
}

/** The Preset a `local/<preset>` Office id is reserved for. */
export function presetIdForLocalId(localId: string): string | undefined {
	return localId.startsWith("local/") ? `builtin/${localId.slice("local/".length)}` : undefined;
}

/** The Preset an Office descends from; an official Office is its own Preset. */
export function ownerPresetId(base: OfficeSpec): string | undefined {
	return base.origin === "official" ? base.id : base.basePreset;
}

export function compileOfficePatch(base: OfficeSpec, patchInput: unknown, library: ComponentLibraryView): CompileResult {
	const shapeIssues = validateOfficePatchShape(patchInput).map((entry) => ({ ...entry, code: "invalid-patch-shape" }));
	if (shapeIssues.length) return { errors: shapeIssues, adjustments: [] };
	const patch = patchInput as OfficePatch;
	if (patch.base !== base.id) return { errors: [{ code: "base-mismatch", path: "$.base", message: `patch base ${patch.base} does not match ${base.id}` }], adjustments: [] };
	const baseValidation = validateOfficeSpec(base, library);
	if (!baseValidation.valid) return { errors: baseValidation.issues.map((entry) => ({ ...entry, path: `$.base${entry.path.slice(1)}` })), adjustments: [] };
	const operationErrors: ValidationIssue[] = [];
	for (const [path, values] of [
		["$.placements.upsert", (patch.placements?.upsert ?? []).map((entry) => entry.id)],
		["$.placements.remove", patch.placements?.remove ?? []],
		["$.npcs.upsert", (patch.npcs?.upsert ?? []).map((entry) => entry.id)],
		["$.npcs.remove", patch.npcs?.remove ?? []],
		["$.activities.enable", patch.activities?.enable ?? []],
		["$.activities.disable", patch.activities?.disable ?? []],
	] as Array<[string, string[]]>) {
		for (const id of new Set(duplicates(values))) operationErrors.push({ code: "duplicate-operation", path, message: `${id} appears more than once` });
	}
	const enabled = new Set(patch.activities?.enable ?? []);
	for (const id of patch.activities?.disable ?? []) if (enabled.has(id)) operationErrors.push({ code: "conflicting-operation", path: "$.activities", message: `${id} cannot be enabled and disabled together` });
	if (operationErrors.length) return { errors: operationErrors, adjustments: [] };

	const adjustments: CompileAdjustment[] = [];
	const components = patch.components ?? {};
	// An Office keeps the room it was created with; `components.layout` is rejected by the shape check.
	const layoutId = base.layout;
	const layout = library.layouts.get(layoutId);
	if (!layout) return { errors: [{ code: "unknown-layout", path: "$.layout", message: `unknown layout ${layoutId}` }], adjustments: [] };
	const placements = upsertById<OfficePlacement>(base.placements, patch.placements?.upsert ?? [], patch.placements?.remove ?? [], "$.placements", adjustments);
	const npcs = upsertById<OfficeNpc>(base.npcs, patch.npcs?.upsert ?? [], patch.npcs?.remove ?? [], "$.npcs", adjustments, mergeNpc);
	const activities = new Set(base.activities);
	for (const id of patch.activities?.disable ?? []) {
		if (!activities.delete(id)) adjustments.push({ code: "disable-missing", path: "$.activities.disable", message: `${id} was not enabled and was ignored` });
	}
	for (const id of patch.activities?.enable ?? []) activities.add(id);

	// Interim: a routine still walks to the layout's fixed stand target, so a prop
	// that satisfies an active routine may keep its slot but must not move to
	// another one — the routine would keep standing where the prop used to be.
	// Drop this once step targets resolve to the prop the requirement bound.
	const requiredCapabilities = new Set<string>();
	for (const id of activities) {
		for (const requirement of library.activityImplementations.get(`${layoutId}|${id}`)?.definition?.requires ?? []) {
			if (requirement && typeof requirement === "object" && typeof requirement.capability === "string") requiredCapabilities.add(requirement.capability);
		}
	}
	if (requiredCapabilities.size) {
		const slotsBefore = new Map(base.placements.map((placement) => [placement.id, placement.slot]));
		for (const placement of placements) {
			const previousSlot = slotsBefore.get(placement.id);
			if (previousSlot === undefined || previousSlot === placement.slot) continue;
			const provides = (library.props.get(placement.component)?.capabilities ?? []).filter((capability: string) => requiredCapabilities.has(capability));
			if (provides.length) {
				return {
					errors: [{
						code: "capability-prop-moved",
						path: "$.placements.upsert",
						message: `${placement.id} provides ${provides.join(", ")}, which an active routine needs; it may be replaced in place but not moved to another slot`,
					}],
					adjustments,
				};
			}
		}
	}

	const draft: OfficeSpec = {
		schemaVersion: OFFICE_SPEC_SCHEMA_VERSION,
		kind: "office-spec",
		id: patch.id ?? patchOfficeId(base),
		name: patch.name ?? base.name,
		origin: "custom",
		basePreset: base.origin === "official" ? base.id : base.basePreset,
		layout: layoutId,
		style: components.style ?? base.style,
		agentSkin: components.agentSkin ?? base.agentSkin,
		placements: truncate(placements, SCENE_LIMITS.props, "$.placements", adjustments),
		npcs: truncate(npcs, SCENE_LIMITS.npcs, "$.npcs", adjustments).map((npc) => resolveNpc(npc, library, layout)),
		activities: truncate([...activities], SCENE_LIMITS.activities, "$.activities", adjustments),
		atmosphere: components.atmosphere ?? base.atmosphere,
		environment: components.environment ?? base.environment,
		...(patch.texts === null ? {} : base.texts || patch.texts ? { texts: { ...base.texts, ...patch.texts } } : {}),
		...(patch.environmentOverrides === null
			? {}
			: patch.environmentOverrides || base.environmentOverrides
				? { environmentOverrides: mergeEnvironment(base.environmentOverrides, patch.environmentOverrides ?? {}) }
				: {}),
		...(patch.agentProfile === null
			? {}
			: patch.agentProfile || base.agentProfile
				? { agentProfile: { ...(base.agentProfile ?? OFFICE_SPEC_DEFAULTS.agentProfile), ...(patch.agentProfile ?? {}), appearance: { ...(base.agentProfile?.appearance ?? {}), ...(patch.agentProfile?.appearance ?? {}) } } }
				: {}),
	};

	const compiled = compileOfficeSpec(draft, library);
	return { draft: compiled.draft, errors: compiled.errors, adjustments: [...adjustments, ...compiled.adjustments] };
}
