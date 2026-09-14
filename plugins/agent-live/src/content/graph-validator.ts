/**
 * Structural rules for a renderable content graph — the single source of truth.
 *
 * Two consumers share this module:
 *  - the browser imports the generated `web/v2/graph-validator.js`
 *    (see `tsconfig.web-validator.json` and `scripts/web-validator.mjs`);
 *  - the local server imports the TypeScript module directly, so the same rules
 *    gate saving an Office Spec and serving `/api/office-content`.
 *
 * Keep this file dependency-free, platform-neutral, and side-effect-free: it is
 * compiled for the browser and bundled into every host integration.
 */

/** Capabilities every layout must expose as a walkable work station. */
export const WORK_CAPABILITIES = ["research", "create", "compute", "plan", "communicate", "collaborate"] as const;

/** Renderer-resolved destinations that deliberately do not belong to a layout. */
export const DYNAMIC_ACTIVITY_TARGETS = new Set(["near-colleague"]);

export interface ContentIssue {
	code: string;
	path: string;
	message: string;
}

/**
 * What an activity needs to be staged: a named prop instance, or a capability
 * any matching prop type can provide. The named form is the legacy syntax;
 * capability requirements let the same implementation be reused across layouts
 * and stop a prop swap from satisfying an activity by id alone.
 */
export type ActivityRequirement = string | { prop: string } | { capability: string };

export interface ResolvedRequirements {
	/** Resolved instance id per requirement, aligned by index; null when unresolved. */
	bindings: (string | null)[];
	issues: ContentIssue[];
}

function namedInstance(requirement: unknown): string | undefined {
	if (typeof requirement === "string") return requirement;
	if (requirement && typeof (requirement as { prop?: unknown }).prop === "string") return (requirement as { prop: string }).prop;
	return undefined;
}

/**
 * Resolves activity requirements against the props actually present, so both
 * syntaxes stay valid while content migrates.
 */
export function resolveActivityRequirements(
	requires: readonly unknown[] | undefined,
	instances: Iterable<readonly [string, string]>,
	capabilitiesOf: (type: string) => readonly string[],
	activity: string,
): ResolvedRequirements {
	const table = [...instances];
	const bindings: (string | null)[] = [];
	const issues: ContentIssue[] = [];
	for (const requirement of requires ?? []) {
		const named = namedInstance(requirement);
		if (named !== undefined) {
			const present = table.some(([instanceId]) => instanceId === named);
			bindings.push(present ? named : null);
			if (!present) issues.push({ code: "missing-activity-prop", path: "$", message: `${activity} 缺少 Prop：${named}` });
			continue;
		}
		const capability = requirement && typeof (requirement as { capability?: unknown }).capability === "string"
			? (requirement as { capability: string }).capability
			: undefined;
		if (!capability) {
			bindings.push(null);
			issues.push({ code: "invalid-activity-requirement", path: "$", message: `${activity} 的依赖必须是具名道具或能力需求` });
			continue;
		}
		const match = table.find(([, type]) => capabilitiesOf(type).includes(capability));
		bindings.push(match ? match[0] : null);
		if (!match) issues.push({ code: "missing-activity-capability", path: "$", message: `${activity} 需要 ${capability} 能力，当前办公室没有提供该能力的道具` });
	}
	return { bindings, issues };
}

export function assertManifest(value: unknown, kind: string): void {
	const manifest = value as { schemaVersion?: unknown; kind?: unknown; id?: unknown; version?: unknown } | null | undefined;
	if (!manifest || manifest.schemaVersion !== 1 || manifest.kind !== kind || !manifest.id || !manifest.version) {
		throw new Error(`无效的 ${kind} 内容清单`);
	}
}

function manifestKindFor(key: string): string {
	if (key === "agentSkin") return "agent-skin";
	if (key === "lifeActivities") return "life-activities";
	return key;
}

function validClock(value: unknown): boolean {
	if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
	const [hour, minute] = value.split(":").map(Number);
	return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function shiftIssue(value: any, code: string, path: string, label: string): ContentIssue | null {
	if (!value || !validClock(value.start) || !validClock(value.end)) return { code, path, message: `${label} 必须提供有效的 HH:MM 起止时间` };
	if (value.endLatest !== undefined && !validClock(value.endLatest)) return { code, path: `${path}.endLatest`, message: `${label} 的最晚下班时间必须是有效的 HH:MM` };
	return null;
}

/**
 * Layout structure rules. `propTypeNames` are the type names a layout may
 * reference; the library stores props namespaced while the rendered graph does
 * not, so both callers normalize before calling.
 */
export function layoutIssues(layout: any, propTypeNames: Iterable<string>): ContentIssue[] {
	if (!layout || typeof layout !== "object") return [{ code: "missing-layout", path: "$.layout", message: "Layout 缺失" }];
	const issues: ContentIssue[] = [];
	if (layout.contract !== "single-office-v1") issues.push({ code: "invalid-layout-contract", path: "$.layout", message: `不支持的 Layout 合同：${layout.contract}` });
	if (layout.canvas?.width !== 384 || layout.canvas?.height !== 216) issues.push({ code: "invalid-layout-canvas", path: "$.layout", message: "single-office-v1 必须使用 384×216 逻辑画布" });
	if (!Array.isArray(layout.seats) || layout.seats.length !== 8) issues.push({ code: "invalid-layout-seats", path: "$.layout", message: "Demo Layout 必须提供 8 个座位" });
	if (!Array.isArray(layout.navigation?.lanes) || !layout.navigation.lanes.length) issues.push({ code: "invalid-layout-navigation", path: "$.layout", message: "Layout 缺少导航通道" });
	const propTypes = new Set(propTypeNames);
	const textIds = new Set<string>();
	if (layout.textSlots !== undefined && (!Array.isArray(layout.textSlots) || layout.textSlots.length > 8)) {
		issues.push({ code: "invalid-text-slots", path: "$.layout.textSlots", message: "maximum 8 text areas" });
	} else for (const slot of layout.textSlots ?? []) {
		const valid = slot && typeof slot.id === "string" && /^[a-z][a-z0-9-]*$/.test(slot.id) && !textIds.has(slot.id)
			&& [slot.x, slot.y, slot.width, slot.height, slot.maxLength].every(Number.isFinite)
			&& slot.x >= 0 && slot.y >= 0 && slot.width >= 12 && slot.height >= 9
			&& slot.x + slot.width <= 384 && slot.y + slot.height <= 216
			&& slot.maxLength >= 1 && slot.maxLength <= 120
			&& [slot.text, slot.defaultText].every((text) => text === undefined || typeof text === "string" && [...text].length <= slot.maxLength);
		if (!valid) issues.push({ code: "invalid-text-slot", path: "$.layout.textSlots", message: "invalid, duplicate or out-of-bounds text area" });
		if (slot?.id) textIds.add(slot.id);
	}
	const propInstances = new Set<unknown>();
	for (const instance of layout.propInstances ?? []) {
		if (!propTypes.has(instance?.type)) issues.push({ code: "unknown-layout-prop", path: "$.layout.propInstances", message: `未知 Prop Type：${instance?.type}` });
		if (!instance?.id || propInstances.has(instance.id)) issues.push({ code: "invalid-layout-prop", path: "$.layout.propInstances", message: `重复或无效的 Prop 实例：${instance?.id ?? "—"}` });
		propInstances.add(instance?.id);
	}
	for (const capability of WORK_CAPABILITIES) {
		if (!layout.stations?.[capability]) issues.push({ code: "missing-layout-station", path: `$.layout.stations.${capability}`, message: `Layout 缺少工作能力：${capability}` });
	}
	return issues;
}

/** Every reason the browser would refuse to render this resolved content graph. */
export function graphIssues(content: any): ContentIssue[] {
	const issues: ContentIssue[] = [];
	for (const [key, value] of Object.entries(content ?? {})) {
		if (key === "preset" || key === "agentProfile") continue;
		try {
			assertManifest(value, manifestKindFor(key));
		} catch (error) {
			issues.push({ code: "invalid-manifest", path: `$.${key}`, message: (error as Error).message });
		}
	}
	const profile = content?.agentProfile;
	if (!profile || typeof profile !== "object" || typeof profile.template !== "string" || !profile.template
		|| !profile.appearance || typeof profile.appearance !== "object" || Array.isArray(profile.appearance)) {
		issues.push({ code: "invalid-agent-profile", path: "$.agentProfile", message: "无效的 Agent Profile" });
	}
	const layout = content?.layout;
	issues.push(...layoutIssues(layout, Object.keys(content?.props?.types ?? {})));
	const instances = (layout?.propInstances ?? []).map((instance: any): [string, string] => [instance?.id, instance?.type]);
	const capabilitiesOf = (type: string): readonly string[] => content?.props?.types?.[type]?.capabilities ?? [];
	;(content?.npcs?.entries ?? []).forEach((npc: any, index: number) => {
		const path = `$.npcs.entries[${index}]`;
		if (!npc?.id || !npc.role || !layout?.targets?.[npc.spawn]) issues.push({ code: "invalid-npc", path, message: `无效的 NPC：${npc?.id ?? "—"}` });
		const shift = npc?.shift ? shiftIssue(npc.shift, "invalid-npc-shift", path, `NPC ${npc.id} 的 shift`) : null;
		if (shift) issues.push(shift);
	});
	;(content?.lifeActivities?.entries ?? []).forEach((activity: any, index: number) => {
		const path = `$.lifeActivities.entries[${index}]`;
		if (!activity?.id || !["agent", "npc", "person"].includes(activity.participant?.kind) || !activity.steps?.length) {
			issues.push({ code: "invalid-activity", path, message: `无效的 Life Activity：${activity?.id ?? "—"}` });
			return;
		}
		if (activity.participant?.minAgents != null && (!Number.isInteger(activity.participant.minAgents) || activity.participant.minAgents < 2)) {
			issues.push({ code: "invalid-activity-participant", path, message: `${activity.id} 的 minAgents 必须是至少 2 的整数` });
		}
		const resolved = resolveActivityRequirements(activity.requires, instances, capabilitiesOf, activity.id);
		issues.push(...resolved.issues.map((issue) => ({ ...issue, path })));
		for (const step of activity.steps ?? []) {
			if (!layout?.targets?.[step?.target] && !DYNAMIC_ACTIVITY_TARGETS.has(step?.target)) issues.push({ code: "missing-activity-target", path, message: `${activity.id} 缺少 Target：${step?.target}` });
			for (const target of step?.targets ?? []) {
				if (!layout?.targets?.[target]) issues.push({ code: "missing-activity-target", path, message: `${activity.id} 缺少 Group Target：${target}` });
			}
		}
	});
	const environment = content?.environment;
	if (!environment || !["local", "fixed"].includes(environment.clock?.mode)) {
		issues.push({ code: "invalid-environment", path: "$.environment", message: "Environment 的 clock.mode 必须是 local 或 fixed" });
	} else {
		if (environment.clock.mode === "fixed" && !validClock(environment.clock.fixedTime)) issues.push({ code: "invalid-environment", path: "$.environment.clock.fixedTime", message: "Environment 的 fixedTime 无效" });
		if (!Array.isArray(environment.clock?.phases) || !environment.clock.phases.length) issues.push({ code: "invalid-environment", path: "$.environment.clock", message: "Environment 缺少 day phases" });
		for (const phase of environment.clock?.phases ?? []) {
			if (!phase?.id || !validClock(phase.start)) issues.push({ code: "invalid-environment", path: "$.environment.clock.phases", message: "Environment 包含无效的 day phase" });
		}
		if (!Array.isArray(environment.weather?.allowedConditions) || !environment.weather.allowedConditions.length) {
			issues.push({ code: "invalid-environment", path: "$.environment.weather", message: "Environment 缺少天气类型" });
		}
		const allowedWeather = new Set(environment.weather?.allowedConditions ?? []);
		for (const condition of [environment.weather?.condition, environment.weather?.fallback]) {
			if (condition != null && !allowedWeather.has(condition)) {
				issues.push({ code: "invalid-environment", path: "$.environment.weather", message: `Environment 的天气 ${condition} 不在 allowedConditions 中` });
			}
		}
		const shift = environment.npcSchedule?.defaultShift ? shiftIssue(environment.npcSchedule.defaultShift, "invalid-environment", "$.environment.npcSchedule", "Environment 的 NPC 默认班次") : null;
		if (shift) issues.push(shift);
		for (const [role, value] of Object.entries(environment.npcSchedule?.roleOverrides ?? {})) {
			const roleIssue = shiftIssue(value, "invalid-environment", `$.environment.npcSchedule.roleOverrides.${role}`, `Environment 的 ${role} 班次`);
			if (roleIssue) issues.push(roleIssue);
		}
	}
	return issues;
}

/** Browser entry point: refuse the first structural problem, exactly as rendered. */
export function validateRegistry(content: unknown): void {
	const issues = graphIssues(content);
	if (issues.length) throw new Error(issues[0].message);
}

/** Server entry point: report every problem at once for the Creator surface. */
export function graphIssueMessages(content: unknown): string[] {
	return graphIssues(content).map((issue) => issue.message);
}
