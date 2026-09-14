/**
 * Host-neutral office world model.
 *
 * Owns spatial navigation, work-station selection and environment queries.
 * It contains no DOM or Canvas operations; renderers consume this API.
 */
export function createOfficeEngine(content, environment = null) {
	const layout = content.layout;
	const ambientEffects = new Set(content.atmosphere.ambientEffects ?? []);
	const targets = Object.fromEntries(Object.entries(layout.targets).map(([key, value]) => [key, { ...value }]));
	const seats = layout.seats.map((seat) => ({
		index: seat.index,
		cx: seat.cx,
		renderer: seat.renderer ?? "workstation",
		deskX: seat.desk.x,
		deskY: seat.desk.y,
		deskW: seat.desk.width,
		deskH: seat.desk.height,
		anchor: { ...seat.anchor },
	}));
	const lanes = [...layout.navigation.lanes];
	const connectors = [...layout.navigation.connectors];
	const perimeter = layout.navigation.perimeter ?? null;

	function currentEnvironment() {
		if (environment?.snapshot) return environment.snapshot();
		const now = new Date();
		const hour = now.getHours();
		const phase = hour >= 6 && hour < 11 ? "morning" : hour >= 11 && hour < 17 ? "noon" : hour >= 17 && hour < 20 ? "evening" : "night";
		return { now, hour, minute: now.getMinutes(), phase, weather: ambientEffects.has("rain-window") ? "rain" : "clear", dynamicTime: false, dynamicWeather: ambientEffects.size > 0, lightingOn: false };
	}

	function seatAnchor(index) {
		return seats[(index ?? 0) % seats.length].anchor;
	}

	function standingAnchor(key = 0) {
		const slots = layout.standingAnchors;
		if (!Array.isArray(slots) || slots.length === 0) return targets.entry;
		return slots[Math.abs(Number(key) || 0) % slots.length];
	}

	function npcHomeTarget(entry, roleIndex = 0) {
		// Seat 0 belongs to the real Agent. Ordinary colleagues occupy the
		// remaining desks; their configured spawn remains only their entrance or
		// role fallback, not the place they return to after every activity.
		if (entry?.role === "colleague" && seats.length > 1) {
			return seatAnchor(1 + Math.max(0, roleIndex) % (seats.length - 1));
		}
		return targets[entry?.spawn] ?? targets.entry;
	}

	function anchorFor(action, seatIndex, fallbackKey = 0) {
		const capability = layout.legacyActions[action ?? "type"] ?? "create";
		const station = layout.stations[capability];
		if (!station || station.kind === "seat") return seatIndex == null ? standingAnchor(fallbackKey) : seatAnchor(seatIndex);
		return targets[station.target] ?? (seatIndex == null ? standingAnchor(fallbackKey) : seatAnchor(seatIndex));
	}

	function perimeterPath(from, target) {
		const { leftX, rightX, topY, bottomY } = perimeter;
		const zoneFor = (point) => point.zone ?? [
			["left", Math.abs(point.x - leftX)], ["right", Math.abs(point.x - rightX)],
			["top", Math.abs(point.y - topY)], ["bottom", Math.abs(point.y - bottomY)],
		].reduce((best, item) => item[1] < best[1] ? item : best)[0];
		const portalFor = (point, zone) => {
			if (zone === "left") return { x: leftX, y: point.y, zone };
			if (zone === "right") return { x: rightX, y: point.y, zone };
			if (zone === "bottom") return { x: point.x, y: bottomY, zone };
			return { x: point.x, y: topY, zone: "top" };
		};
		const fromZone = zoneFor(from);
		const toZone = zoneFor(target);
		const start = portalFor(from, fromZone);
		const end = portalFor(target, toZone);
		const nodes = [
			start,
			end,
			{ x: leftX, y: topY, zone: "top" },
			{ x: rightX, y: topY, zone: "top" },
			{ x: rightX, y: bottomY, zone: "bottom" },
			{ x: leftX, y: bottomY, zone: "bottom" },
		];
		const connected = (a, b) => (a.x === b.x && (a.x === leftX || a.x === rightX)) || (a.y === b.y && (a.y === topY || a.y === bottomY));
		const distance = nodes.map(() => Infinity);
		const previous = nodes.map(() => -1);
		const visited = new Set();
		distance[0] = 0;
		while (visited.size < nodes.length) {
			let current = -1;
			for (let index = 0; index < nodes.length; index += 1) if (!visited.has(index) && (current < 0 || distance[index] < distance[current])) current = index;
			if (current < 0 || distance[current] === Infinity) break;
			visited.add(current);
			for (let index = 0; index < nodes.length; index += 1) {
				if (visited.has(index) || !connected(nodes[current], nodes[index])) continue;
				const candidate = distance[current] + Math.abs(nodes[current].x - nodes[index].x) + Math.abs(nodes[current].y - nodes[index].y);
				if (candidate < distance[index]) { distance[index] = candidate; previous[index] = current; }
			}
		}
		const route = [];
		for (let index = 1; index >= 0; index = previous[index]) route.unshift(nodes[index]);
		const points = [];
		const push = (point) => {
			const last = points.at(-1);
			if (!last || last.x !== point.x || last.y !== point.y) points.push(point);
		};
		push(start);
		for (const point of route.slice(1)) push(point);
		push({ ...target, zone: toZone });
		return points;
	}

	function path(from, target) {
		if (Math.abs(from.x - target.x) < 0.5 && Math.abs(from.y - target.y) < 0.5) return [];
		if (perimeter) return perimeterPath(from, target);
		const fromLane = from.lane ?? 1;
		const toLane = target.lane ?? 1;
		const points = [];
		const laneY = lanes[fromLane];
		if (Math.abs(from.y - laneY) > 0.5) points.push({ x: from.x, y: laneY });
		if (fromLane !== toLane) {
			const x = connectors.reduce((best, candidate) => Math.abs(candidate - from.x) + Math.abs(candidate - target.x) < Math.abs(best - from.x) + Math.abs(best - target.x) ? candidate : best);
			points.push({ x, y: laneY }, { x, y: lanes[toLane] });
		}
		points.push({ x: target.x, y: lanes[toLane] }, { x: target.x, y: target.y });
		return points;
	}

	function stationKey(action, seatIndex) {
		const capability = layout.legacyActions[action ?? "type"] ?? "create";
		const station = layout.stations[capability];
		return !station || station.kind === "seat" ? `desk${seatIndex ?? 0}` : station.target;
	}

	return Object.freeze({
		W: layout.canvas.width, H: layout.canvas.height, WALL_H: layout.wallHeight,
		LANES: lanes, SEATS: seats, TARGETS: targets,
		interactions: Object.freeze({ ...(layout.interactions ?? {}) }),
		currentEnvironment, anchorFor, seatAnchor, standingAnchor, npcHomeTarget, path, stationKey,
		startDayPreview: (durationMs = 24000) => environment?.startPreview?.(durationMs) ?? false,
		getOfficeTime: currentEnvironment,
		isNpcOnDuty: (role, shift, identity) => environment?.isNpcOnDuty?.(role, shift, identity) ?? true,
		npcShiftLabel: (kind) => environment?.shiftLabel?.(kind) ?? (kind === "arrival" ? "上班啦" : "下班啦"),
	});
}
