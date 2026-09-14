const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_PHASES = [
	{ id: "morning", start: "06:00" },
	{ id: "noon", start: "11:00" },
	{ id: "evening", start: "17:00" },
	{ id: "night", start: "20:00" },
];
const DEFAULT_WEATHER = ["clear", "cloudy", "rain", "snow"];

function parseClock(value, fallback = 0) {
	if (typeof value !== "string" || !/^\d{1,2}:\d{2}$/.test(value)) return fallback;
	const [hour, minute] = value.split(":").map(Number);
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
	return hour * 60 + minute;
}

function phaseAt(minutes, phases) {
	const ordered = phases
		.map((phase) => ({ ...phase, minute: parseClock(phase.start) }))
		.sort((a, b) => a.minute - b.minute);
	let selected = ordered[ordered.length - 1]?.id ?? "noon";
	for (const phase of ordered) {
		if (minutes < phase.minute) break;
		selected = phase.id;
	}
	return selected;
}

function stableHash(value) {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

/** Shared local clock, weather and NPC scheduling for every Office Preset. */
export function createEnvironmentRuntime(config) {
	const clock = config.clock ?? {};
	const weather = config.weather ?? {};
	const lighting = config.lighting ?? {};
	const npcSchedule = config.npcSchedule ?? {};
	const allowedWeather = new Set(weather.allowedConditions ?? DEFAULT_WEATHER);
	let preview = null;
	let timeOverride = null;
	let weatherOverride = null;

	function officeDate() {
		const now = new Date();
		let minutes = now.getHours() * 60 + now.getMinutes();
		if (preview) {
			const elapsed = (performance.now() - preview.startedAt) % preview.durationMs;
			minutes = (preview.startMinute + (elapsed / preview.durationMs) * MINUTES_PER_DAY) % MINUTES_PER_DAY;
		} else if (timeOverride != null) {
			minutes = timeOverride;
		} else if (clock.mode === "fixed") {
			minutes = parseClock(clock.fixedTime, minutes);
		}
		now.setHours(Math.floor(minutes / 60), Math.floor(minutes % 60), 0, 0);
		return now;
	}

	function snapshot() {
		const now = officeDate();
		const minutes = now.getHours() * 60 + now.getMinutes();
		const phase = phaseAt(minutes, clock.phases ?? DEFAULT_PHASES);
		const condition = weatherOverride ?? weather.condition ?? weather.fallback ?? "clear";
		return Object.freeze({
			now,
			hour: now.getHours(),
			minute: now.getMinutes(),
			minutes,
			phase,
			weather: condition,
			dynamicTime: config.render?.dynamicTime === true,
			dynamicWeather: config.render?.dynamicWeather === true,
			lightingOn: lighting.enabled === true && (lighting.activePhases ?? ["evening", "night"]).includes(phase),
			previewing: Boolean(preview),
		});
	}

	function startPreview(durationMs) {
		const settings = clock.preview ?? {};
		if (settings.enabled !== true || timeOverride != null) return false;
		preview = {
			startedAt: performance.now(),
			durationMs: Math.max(8000, Number(durationMs ?? settings.durationMs ?? 24000)),
			startMinute: parseClock(settings.startTime, 6 * 60),
		};
		return true;
	}

	function update(overrides = {}) {
		if (Object.hasOwn(overrides, "time")) {
			if (overrides.time == null || overrides.time === "") {
				timeOverride = null;
			} else {
				const parsed = parseClock(String(overrides.time), -1);
				if (parsed < 0) throw new Error(`无效的时间：${overrides.time}`);
				timeOverride = parsed;
			}
			preview = null;
		}
		if (Object.hasOwn(overrides, "weather")) {
			const condition = overrides.weather == null || overrides.weather === "" ? null : String(overrides.weather);
			if (condition != null && !allowedWeather.has(condition)) throw new Error(`不支持的天气：${condition}`);
			weatherOverride = condition;
		}
		return snapshot();
	}

	function isNpcOnDuty(role, entryShift, identity = role) {
		if (npcSchedule.enabled === false) return true;
		const shift = {
			...(npcSchedule.defaultShift ?? { start: "06:00", end: "18:00" }),
			...(npcSchedule.roleOverrides?.[role] ?? {}),
			...(entryShift ?? {}),
		};
		if (shift.enabled === false) return true;
		const start = parseClock(shift.start, 6 * 60);
		const earliestEnd = parseClock(shift.end, 18 * 60);
		const latestEnd = parseClock(shift.endLatest, earliestEnd);
		const currentSnapshot = snapshot();
		const dayKey = `${currentSnapshot.now.getFullYear()}-${currentSnapshot.now.getMonth() + 1}-${currentSnapshot.now.getDate()}`;
		const spread = Math.max(0, latestEnd - earliestEnd);
		const end = earliestEnd + (spread ? stableHash(`${dayKey}:${identity}`) % (spread + 1) : 0);
		const current = currentSnapshot.minutes;
		if (start === end) return true;
		return start < end ? current >= start && current < end : current >= start || current < end;
	}

	function shiftLabel(kind) {
		return kind === "arrival" ? (npcSchedule.labels?.arrival ?? "上班啦") : (npcSchedule.labels?.departure ?? "下班啦");
	}

	return Object.freeze({ config, snapshot, startPreview, update, isNpcOnDuty, shiftLabel });
}
