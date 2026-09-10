export function assertManifest(value, kind) {
	if (!value || value.schemaVersion !== 1 || value.kind !== kind || !value.id || !value.version) throw new Error(`无效的 ${kind} 内容清单`);
}

function validClock(value) {
	if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
	const [hour, minute] = value.split(":").map(Number);
	return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function assertShift(shift, label) {
	if (!shift || !validClock(shift.start) || !validClock(shift.end)) throw new Error(`${label} 必须提供有效的 HH:MM 起止时间`);
}

export function validateRegistry(content) {
	for (const [key, value] of Object.entries(content)) {
		if (key === "preset" || key === "agentProfile") continue;
		assertManifest(value, key === "agentSkin" ? "agent-skin" : key === "lifeActivities" ? "life-activities" : key);
	}
	const profile = content.agentProfile;
	if (!profile || typeof profile !== "object" || typeof profile.template !== "string" || !profile.template || !profile.appearance || typeof profile.appearance !== "object" || Array.isArray(profile.appearance)) throw new Error("无效的 Agent Profile");
	const { layout, props, npcs, lifeActivities } = content;
	if (layout.contract !== "single-office-v1") throw new Error(`不支持的 Layout 合同：${layout.contract}`);
	if (layout.canvas?.width !== 384 || layout.canvas?.height !== 216) throw new Error("single-office-v1 必须使用 384×216 逻辑画布");
	if (!Array.isArray(layout.seats) || layout.seats.length !== 8) throw new Error("Demo Layout 必须提供 8 个座位");
	if (!Array.isArray(layout.navigation?.lanes) || !layout.navigation.lanes.length) throw new Error("Layout 缺少导航通道");
	const propTypes = new Set(Object.keys(props.types ?? {}));
	const propInstances = new Set();
	for (const instance of layout.propInstances ?? []) {
		if (!propTypes.has(instance.type)) throw new Error(`未知 Prop Type：${instance.type}`);
		if (!instance.id || propInstances.has(instance.id)) throw new Error(`重复或无效的 Prop 实例：${instance.id ?? "—"}`);
		propInstances.add(instance.id);
	}
	for (const capability of ["research", "create", "compute", "plan", "communicate", "collaborate"]) if (!layout.stations?.[capability]) throw new Error(`Layout 缺少工作能力：${capability}`);
	for (const npc of npcs.entries ?? []) {
		if (!npc.id || !npc.role || !layout.targets?.[npc.spawn]) throw new Error(`无效的 NPC：${npc.id ?? "—"}`);
		if (npc.shift) assertShift(npc.shift, `NPC ${npc.id} 的 shift`);
	}
	for (const activity of lifeActivities.entries ?? []) {
		if (!activity.id || !["agent", "npc"].includes(activity.participant?.kind) || !activity.steps?.length) throw new Error(`无效的 Life Activity：${activity.id ?? "—"}`);
		if (activity.participant?.minAgents != null && (!Number.isInteger(activity.participant.minAgents) || activity.participant.minAgents < 2)) throw new Error(`${activity.id} 的 minAgents 必须是至少 2 的整数`);
		for (const requiredProp of activity.requires ?? []) if (!propInstances.has(requiredProp)) throw new Error(`${activity.id} 缺少 Prop：${requiredProp}`);
		for (const step of activity.steps) {
			if (!layout.targets?.[step.target]) throw new Error(`${activity.id} 缺少 Target：${step.target}`);
			for (const target of step.targets ?? []) if (!layout.targets?.[target]) throw new Error(`${activity.id} 缺少 Group Target：${target}`);
		}
	}
	const environment = content.environment;
	if (!["local", "fixed"].includes(environment.clock?.mode)) throw new Error("Environment 的 clock.mode 必须是 local 或 fixed");
	if (environment.clock.mode === "fixed" && !validClock(environment.clock.fixedTime)) throw new Error("Environment 的 fixedTime 无效");
	if (!Array.isArray(environment.clock?.phases) || !environment.clock.phases.length) throw new Error("Environment 缺少 day phases");
	for (const phase of environment.clock.phases) if (!phase.id || !validClock(phase.start)) throw new Error("Environment 包含无效的 day phase");
	if (!Array.isArray(environment.weather?.allowedConditions) || !environment.weather.allowedConditions.length) throw new Error("Environment 缺少天气类型");
	const allowedWeather = new Set(environment.weather.allowedConditions);
	for (const condition of [environment.weather.condition, environment.weather.fallback]) if (condition != null && !allowedWeather.has(condition)) throw new Error(`Environment 的天气 ${condition} 不在 allowedConditions 中`);
	assertShift(environment.npcSchedule?.defaultShift, "Environment 的 NPC 默认班次");
	for (const [role, shift] of Object.entries(environment.npcSchedule?.roleOverrides ?? {})) assertShift(shift, `Environment 的 ${role} 班次`);
}
