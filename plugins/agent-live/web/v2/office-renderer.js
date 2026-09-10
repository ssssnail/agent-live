import { createOfficeEngine } from "./office-engine.js";

/** Build the V2 Canvas renderer from content data and the shared world engine. */
export function createOfficeRenderer(content, environment = null) {
	const engine = createOfficeEngine(content, environment);
	const localize = (value) => window.AgentLiveI18n?.text(value) ?? value;
	const layout = content.layout;
	const propTypes = content.props.types;
	const C = { ...content.style.tokens.canvas, ...(content.atmosphere.styleOverrides?.canvas ?? {}) };
	const renderMode = content.preset.render?.detail ?? content.style.tokens.render?.detail ?? "classic";
	const rich = renderMode === "rich";
	const { W, H, WALL_H, SEATS, TARGETS } = engine;
	const AREAS = [...(layout.areas ?? [])];
	const instances = layout.propInstances.map((instance) => {
		const type = propTypes[instance.type];
		return {
			...instance,
			w: instance.width ?? type.size.width,
			h: instance.height ?? type.size.height,
			capabilities: type.capabilities,
		renderer: type.renderer,
		};
	});
	const byRenderer = (renderer) => instances.filter((instance) => instance.renderer === renderer);
	const first = (renderer) => byRenderer(renderer)[0];
	const FURNITURE = {
		archive: first("archive-cabinet"),
		server: first("server-rack"),
		coffee: first("coffee-machine"),
		phone: first("phone-table"),
		whiteboard: first("whiteboard"),
		meeting: first("meeting-table"),
	};

	const px = (c, x, y, w, h, color) => {
		c.fillStyle = color;
		c.fillRect(x | 0, y | 0, w | 0, h | 0);
	};
	const poly = (c, points, color) => {
		c.beginPath();
		c.moveTo(points[0][0] | 0, points[0][1] | 0);
		for (let i = 1; i < points.length; i++) c.lineTo(points[i][0] | 0, points[i][1] | 0);
		c.closePath();
		c.fillStyle = color;
		c.fill();
	};
	const noise = (x, y, salt = 0) => {
		let value = Math.imul((x | 0) + 17, 374761393) ^ Math.imul((y | 0) + 31, 668265263) ^ salt;
		value = Math.imul(value ^ (value >>> 13), 1274126177);
		return (value ^ (value >>> 16)) >>> 0;
	};
	const outline = (c, x, y, w, h, color = C.outline ?? C.woodDark) => {
		px(c, x, y, w, 1, color);
		px(c, x, y + h - 1, w, 1, color);
		px(c, x, y, 1, h, color);
		px(c, x + w - 1, y, 1, h, color);
	};
	const pixelLine = (c, x0, y0, x1, y1, color) => {
		x0 |= 0;
		y0 |= 0;
		x1 |= 0;
		y1 |= 0;
		const dx = Math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = -Math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let error = dx + dy;
		while (true) {
			px(c, x0, y0, 1, 1, color);
			if (x0 === x1 && y0 === y1) break;
			const twice = 2 * error;
			if (twice >= dy) {
				error += dy;
				x0 += sx;
			}
			if (twice <= dx) {
				error += dx;
				y0 += sy;
			}
		}
	};
	const currentEnvironment = engine.currentEnvironment;

	function drawFloor(c) {
		px(c, 0, WALL_H, W, H - WALL_H, C.floorA);
		if (rich) {
			const plankH = 8;
			const plankW = 32;
			for (let y = WALL_H; y < H; y += plankH) {
				const row = ((y - WALL_H) / plankH) | 0;
				const offset = row % 2 ? -(plankW >> 1) : 0;
				for (let x = offset; x < W; x += plankW) {
					const tone = noise(x, y, 91) % 3;
					px(c, x + 1, y + 1, plankW - 1, plankH - 1, tone === 0 ? C.floorA : tone === 1 ? C.floorB : C.floorC);
					px(c, x + 5 + (noise(x, y, 17) % 15), y + 3, 8 + (noise(x, y, 33) % 8), 1, C.floorGrain);
				}
				px(c, 0, y, W, 1, C.floorLine);
			}
		} else {
		for (let y = WALL_H; y < H; y += 16) {
			for (let x = 0; x < W; x += 16) {
				if (((x / 16) | 0) % 2 === ((y / 16) | 0) % 2) px(c, x, y, 16, 16, C.floorB);
			}
		}
		for (let y = WALL_H; y < H; y += 16) px(c, 0, y, W, 1, C.floorLine);
		for (let x = 0; x < W; x += 16) px(c, x, WALL_H, 1, H - WALL_H, C.floorLine);
		}
		for (const rug of byRenderer("rug")) {
			if (rich) px(c, rug.x + 2, rug.y + 3, rug.w, rug.h, C.objectShadow);
			px(c, rug.x, rug.y, rug.w, rug.h, C.rug);
			px(c, rug.x, rug.y, rug.w, 1, C.rugEdge);
			px(c, rug.x, rug.y + rug.h - 1, rug.w, 1, C.rugEdge);
			px(c, rug.x, rug.y, 1, rug.h, C.rugEdge);
			px(c, rug.x + rug.w - 1, rug.y, 1, rug.h, C.rugEdge);
		}
	}

	function drawWall(c, t, officeTime) {
		const timedSky = {
			morning: C.skyMorning ?? "#7faec7",
			noon: C.skyNoon ?? "#91cde0",
			evening: C.skyEvening ?? "#d98262",
			night: C.skyNight ?? "#17243c",
		}[officeTime.phase];
		const sky = officeTime.dynamicTime ? timedSky : C.glass;
		px(c, 0, 0, W, WALL_H, C.wall);
		px(c, 0, 0, W, 6, C.wallTop);
		px(c, 0, WALL_H - 3, W, 3, C.wallTrim);
		if (rich) {
			px(c, 0, 6, W, 2, C.wallShade);
			for (let x = 0; x < W; x += 48) {
				px(c, x, 7, 2, WALL_H - 10, C.wallSeam);
				px(c, x + 2, 7, 1, WALL_H - 10, C.wallHighlight);
			}
			px(c, 0, WALL_H - 7, W, 4, C.wallBase);
			px(c, 0, WALL_H - 7, W, 1, C.wallHighlight);
		}
		for (const door of byRenderer("door")) {
			if (rich) px(c, door.x - 3, door.y - 3, door.w + 6, door.h + 4, C.outline);
			px(c, door.x, door.y, door.w, door.h, C.door);
			px(c, door.x, door.y, door.w, 2, C.doorDark);
			px(c, door.x + door.w - 3, door.y, 3, door.h, C.doorDark);
			px(c, door.x + 4, door.y + 4, door.w - 11, door.h - 8, C.doorPanel);
			if (rich) {
				outline(c, door.x + 5, door.y + 5, door.w - 12, Math.max(6, (door.h >> 1) - 5), C.doorDark);
				outline(c, door.x + 5, door.y + (door.h >> 1) + 1, door.w - 12, Math.max(6, (door.h >> 1) - 5), C.doorDark);
				px(c, door.x + 7, door.y + 7, door.w - 16, 1, C.doorLite);
			}
			px(c, door.x + door.w - 9, door.y + 16, 2, 3, C.paper);
		}
		for (const window of byRenderer("window")) {
			if (rich) px(c, window.x - 4, window.y - 4, window.w + 8, window.h + 7, C.outline);
			px(c, window.x - 2, window.y - 2, window.w + 4, window.h + 4, C.wallTrim);
			px(c, window.x, window.y, window.w, window.h, sky);
			px(c, window.x, window.y, window.w, 8, officeTime.dynamicTime && officeTime.phase === "night" ? (C.skyNightLite ?? C.glass) : C.glassLite);
			if (rich) {
				px(c, window.x + 2, window.y + 2, window.w - 4, 2, C.glassShine);
				px(c, window.x + 3, window.y + 5, 2, window.h - 8, C.glassShine);
				px(c, window.x - 3, window.y + window.h + 2, window.w + 6, 3, C.wallBase);
			}
			px(c, window.x + (window.w >> 1), window.y, 1, window.h, C.wallTrim);
			px(c, window.x, window.y + (window.h >> 1), window.w, 1, C.wallTrim);
			if (!officeTime.dynamicTime && Math.sin(t / 900 + window.x) > 0.7) px(c, window.x + 6, window.y + 14, 2, 2, C.windowSpark);
			if (officeTime.dynamicTime && officeTime.phase === "morning") px(c, window.x + 6, window.y + 11, 5, 5, C.skySun ?? C.windowSpark);
			if (officeTime.dynamicTime && officeTime.phase === "noon" && Math.sin(t / 900 + window.x) > 0.7) px(c, window.x + 6, window.y + 14, 2, 2, C.windowSpark);
			if (officeTime.dynamicTime && officeTime.phase === "evening") px(c, window.x + 1, window.y + window.h - 6, window.w - 2, 5, C.skyHorizon ?? C.activeRed);
			if (officeTime.dynamicTime && officeTime.phase === "night") {
				px(c, window.x + 7, window.y + 12, 2, 2, C.skyStar ?? C.windowSpark);
				px(c, window.x + window.w - 10, window.y + 6, 1, 1, C.skyStar ?? C.windowSpark);
				for (let bx = window.x + 4; bx < window.x + window.w - 3; bx += 7) {
					const height = 3 + (noise(bx, window.y, 47) % 6);
					px(c, bx, window.y + window.h - height, 5, height, C.skyBuilding ?? C.wallTop);
					if (noise(bx, window.y, 19) % 2) px(c, bx + 2, window.y + window.h - height + 2, 1, 1, C.skyWindow ?? C.windowSpark);
				}
			}
			drawWindowWeather(c, window, t, officeTime);
		}
		for (const window of byRenderer("venetian-window")) {
			px(c, window.x - 2, window.y - 2, window.w + 4, window.h + 4, C.wallTrim);
			px(c, window.x, window.y, window.w, window.h, sky);
			px(c, window.x + (window.w >> 1), window.y, 1, window.h, C.wallTrim);
			drawWindowWeather(c, window, t, officeTime);
			for (let y = window.y + 3; y < window.y + window.h - 1; y += 4) {
				px(c, window.x + 1, y, window.w - 2, 1, C.paperLine);
			}
		}
	}

	function drawWindowWeather(c, window, t, officeTime) {
		const condition = officeTime.dynamicWeather ? officeTime.weather : ambientEffects.has("rain-window") ? "rain" : "clear";
		if (condition === "cloudy") {
			px(c, window.x + 5, window.y + 8, Math.max(8, window.w - 18), 3, C.cloud ?? C.paper);
			px(c, window.x + 12, window.y + 5, Math.max(5, window.w - 25), 4, C.cloud ?? C.paper);
		}
		if (condition === "rain") {
			for (let i = 0; i < 4; i++) {
				const rx = window.x + 5 + ((i * 11 + ((t / 180) | 0) * 3) % Math.max(8, window.w - 10));
				const ry = window.y + 3 + ((i * 7 + ((t / 95) | 0) * 2) % Math.max(6, window.h - 7));
				px(c, rx, ry, 1, 4, C.rain ?? C.waterActive);
			}
		}
		if (condition === "snow") {
			for (let i = 0; i < 5; i++) {
				const sx = window.x + 4 + ((i * 13 + ((t / 260) | 0)) % Math.max(7, window.w - 8));
				const sy = window.y + 3 + ((i * 7 + ((t / 180) | 0)) % Math.max(5, window.h - 6));
				px(c, sx, sy, 2, 2, C.snow ?? C.paper);
			}
		}
	}

	function drawWhiteboard(c, item, hot, t) {
		px(c, item.x - 2, item.y - 2, item.w + 4, item.h + 4, C.boardFrame);
		px(c, item.x, item.y, item.w, item.h, C.board);
		px(c, item.x + 5, item.y + 4, 34, 1, C.boardText);
		px(c, item.x + 5, item.y + 8, 46, 1, C.boardText);
		px(c, item.x + 5, item.y + 12, 26, 1, C.boardTextDim);
		if (hot.has("whiteboard")) {
			const n = 4 + (((t / 140) | 0) % 24);
			px(c, item.x + 5, item.y + 16, n, 1, C.activeRed);
			px(c, item.x + 5, item.y + 20, Math.max(2, n - 9), 1, C.activeBlue);
		} else {
			px(c, item.x + 5, item.y + 16, 18, 1, C.boardIdle);
		}
	}

	function drawDesk(c, seat, hot) {
		const { deskX: x, deskY: y, deskW: w, deskH: h } = seat;
		if (rich) px(c, x + 3, y + 5, w, h + 3, C.objectShadow);
		px(c, x, y + h, w, 3, C.woodDark);
		if (rich) outline(c, x - 1, y - 1, w + 2, h + 3);
		px(c, x, y, w, h, C.deskTop);
		px(c, x, y, w, 2, C.deskLite);
		px(c, x + 2, y + h - 2, w - 4, 2, C.woodDark);
		if (rich) {
			px(c, x + 5, y + 5, w - 10, 1, C.woodGrain);
			px(c, x + 3, y + h, 4, 6, C.woodDark);
			px(c, x + w - 7, y + h, 4, 6, C.woodDark);
		}
		const mx = seat.cx - 9;
		const my = y - 11;
		if (rich) px(c, mx - 2, my - 2, 22, 15, C.outline);
		px(c, mx - 1, my - 1, 20, 13, C.metalDark);
		px(c, mx, my, 18, 11, C.screen);
		if (rich) px(c, mx + 2, my + 2, 14, 1, C.screenGlow);
		if (hot.has(`desk${seat.index}`)) {
			px(c, mx + 2, my + 2, 14, 1, C.activeGreen);
			px(c, mx + 2, my + 4, 10, 1, C.activeThink);
			px(c, mx + 2, my + 6, 12, 1, C.activeThink);
			px(c, mx + 2, my + 8, 6, 1, C.activeAccent);
		} else {
			px(c, mx + 2, my + 3, 8, 1, C.screenIdle);
			px(c, mx + 2, my + 6, 11, 1, C.screenIdle);
		}
		px(c, seat.cx - 2, my + 12, 4, 2, C.metalDark);
		if (rich) {
			px(c, seat.cx - 7, y + 9, 15, 3, C.keyboard);
			for (let key = 0; key < 6; key++) px(c, seat.cx - 6 + key * 2, y + 10, 1, 1, C.keyboardKey);
			const accessory = seat.index % 4;
			if (accessory === 0) {
				px(c, x + 4, y + 4, 3, 4, C.mug);
				px(c, x + 7, y + 5, 1, 2, C.mugLite);
			} else if (accessory === 1) {
				px(c, x + 4, y + 6, 5, 3, C.pot);
				px(c, x + 5, y + 2, 1, 5, C.plantDark);
				px(c, x + 3, y + 2, 3, 3, C.plantLite);
				px(c, x + 6, y + 1, 3, 4, C.plantHighlight);
			} else if (accessory === 2) {
				px(c, x + 3, y + 4, 7, 5, C.activeAccent);
				px(c, x + 4, y + 3, 2, 2, C.activeAccent);
				px(c, x + 7, y + 3, 2, 2, C.activeAccent);
				px(c, x + 4, y + 5, 1, 1, C.faceInk ?? C.outline);
				px(c, x + 8, y + 5, 1, 1, C.faceInk ?? C.outline);
			} else {
				px(c, x + 3, y + 5, 8, 5, C.paper);
				px(c, x + 4, y + 6, 6, 1, C.activeThink);
				px(c, x + 4, y + 8, 4, 1, C.paperLine);
			}
		}
		px(c, seat.cx + 12, y + 4, 7, 5, C.paper);
		px(c, seat.cx + 12, y + 4, 7, 1, C.paperLine);
	}

	function drawChair(c, seat, occupied) {
		const x = seat.cx - 7;
		const y = seat.deskY + 21;
		if (rich) px(c, x + 2, y + 3, 14, 11, C.objectShadow);
		px(c, x, y, 14, 9, occupied ? C.chairDark : C.chair);
		if (rich) {
			outline(c, x - 1, y - 1, 16, 11);
			px(c, x + 2, y + 2, 10, 2, occupied ? C.chair : C.chairLite);
		}
		px(c, x, y + 9, 14, 2, C.chairDark);
		px(c, x + 5, y + 11, 4, 3, C.metalDark);
	}

	function drawCubicleSeat(c, seat, hot) {
		const { deskX: x, deskY: y, deskW: w, deskH: h } = seat;
		px(c, x, y + h, w, 3, C.woodDark);
		px(c, x, y, w, h, C.deskTop);
		px(c, x, y, w, 2, C.deskLite);
		const mx = seat.cx - 8;
		const my = seat.anchor.dir === "down" ? y + h - 1 : y - 13;
		px(c, mx - 1, my - 1, 18, 13, C.metalDark);
		px(c, mx, my, 16, 10, C.screen);
		if (hot.has(`desk${seat.index}`)) {
			px(c, mx + 2, my + 2, 12, 1, C.activeGreen);
			px(c, mx + 2, my + 5, 8, 1, C.activeThink);
			px(c, mx + 2, my + 7, 11, 1, C.activeAccent);
		} else {
			px(c, mx + 2, my + 3, 8, 1, C.screenIdle);
			px(c, mx + 2, my + 6, 11, 1, C.screenIdle);
		}
		px(c, mx + 6, my + 11, 4, 2, C.metalDark);
		px(c, x + w - 10, y + 4, 7, 5, C.phoneDevice);
		px(c, x + 3, y + 5, 8, 5, C.paper);
	}

	function drawBoardroomSeat(c, seat, hot, occupied) {
		const { deskX: x, deskY: y, deskW: w, deskH: h } = seat;
		px(c, x - 1, y - 1, w + 2, h + 2, C.metalDark);
		px(c, x, y, w, h, C.screen);
		px(c, x + 2, y + 2, w - 4, 1, hot.has(`desk${seat.index}`) ? C.activeGreen : C.screenIdle);
		px(c, x + 2, y + 5, Math.max(3, w - 7), 1, hot.has(`desk${seat.index}`) ? C.activeThink : C.screenIdle);
		px(c, x + 2, y + h, w - 4, 2, C.metalDark);
		const a = seat.anchor;
		const chairSeat = { ...seat, deskY: a.y - 21 };
		if (a.dir === "up" || a.dir === "down") {
			drawChair(c, chairSeat, occupied);
		} else {
			const color = occupied ? C.chairDark : C.chair;
			px(c, a.x - 4, a.y - 7, 8, 14, color);
			px(c, a.x + (a.dir === "right" ? -6 : 4), a.y - 5, 2, 10, C.metalDark);
			px(c, a.x - 1, a.y + 7, 2, 3, C.metalDark);
		}
	}

	function drawArchive(c, item, hot, t) {
		if (rich) px(c, item.x + 3, item.y + 4, item.w, item.h, C.objectShadow);
		px(c, item.x, item.y, item.w, item.h, C.metal);
		if (rich) outline(c, item.x - 1, item.y - 1, item.w + 2, item.h + 2);
		px(c, item.x, item.y, item.w, 2, C.metalLite);
		const open = hot.has("archive") ? ((t / 260) | 0) % 3 : -1;
		for (let i = 0; i < 3; i++) {
			const dy = item.y + 4 + i * 9;
			px(c, item.x + 3, dy, item.w - 6, 7, C.metalDark);
			px(c, item.x + 3, dy, item.w - 6, 1, C.drawerLite);
			px(c, item.x + (item.w >> 1) - 5, dy + 3, 10, 1, C.drawerHandle);
			if (i === open) {
				px(c, item.x + 3, dy, item.w - 6, 7, C.drawerOpen);
				px(c, item.x + 5, dy + 1, item.w - 10, 5, C.paper);
			}
		}
	}

	function drawServerRack(c, item, hot, t) {
		if (rich) px(c, item.x + 3, item.y + 4, item.w, item.h, C.objectShadow);
		px(c, item.x, item.y, item.w, item.h, C.rack);
		if (rich) outline(c, item.x - 1, item.y - 1, item.w + 2, item.h + 2);
		px(c, item.x, item.y, item.w, 2, C.rackTrim);
		const fast = hot.has("server");
		for (let i = 0; i < 3; i++) {
			const dy = item.y + 5 + i * 9;
			px(c, item.x + 3, dy, item.w - 6, 7, C.rackPanel);
			px(c, item.x + 5, dy + 3, item.w - 24, 1, C.rackLine);
			const on = Math.sin((fast ? t / 90 : t / 520) + i * 1.7) > 0;
			px(c, item.x + item.w - 12, dy + 2, 2, 2, on ? C.signalOn : C.signalOff);
			px(c, item.x + item.w - 8, dy + 2, 2, 2, on ? C.signalOff : C.signalOn);
		}
	}

	function drawCoffee(c, item, hot, t) {
		px(c, item.x, item.y, item.w, item.h, C.metalDark);
		px(c, item.x, item.y, item.w, 2, C.metal);
		px(c, item.x + 4, item.y + 5, item.w - 8, 8, C.coffeePanel);
		px(c, item.x + 6, item.y + 7, 6, 4, hot.has("coffee") ? C.coffeeHot : C.coffeeIdle);
		px(c, item.x + 5, item.y + item.h - 5, item.w - 10, 3, C.metal);
		if (hot.has("coffee") && ((t / 240) | 0) % 2) px(c, item.x + 9, item.y - 3, 2, 3, C.steam);
	}

	function drawWaterCooler(c, item, hot, t) {
		const active = hot.has("water");
		px(c, item.x + 2, item.y, item.w - 4, 11, C.waterGlass);
		px(c, item.x + 3, item.y + 2, item.w - 6, 6, active ? C.waterActive : C.waterLevel);
		px(c, item.x + 1, item.y + 10, item.w - 2, item.h - 10, C.waterBody);
		px(c, item.x + 1, item.y + item.h - 3, item.w - 2, 3, C.waterDark);
		px(c, item.x + 4, item.y + 14, 3, 2, C.activeBlue);
		px(c, item.x + item.w - 7, item.y + 14, 3, 2, C.activeRed);
		px(c, item.x + 5, item.y + 18, item.w - 10, 4, C.waterDark);
		if (active && ((t / 180) | 0) % 2) px(c, item.x - 2, item.y + 17, 2, 4, C.waterActive);
	}

	function drawPhoneTable(c, item, hot, t) {
		px(c, item.x, item.y, item.w, item.h, C.wood);
		px(c, item.x, item.y, item.w, 2, C.phoneTop);
		px(c, item.x + 8, item.y - 7, 16, 8, C.phoneDevice);
		px(c, item.x + 10, item.y - 5, 12, 3, hot.has("phone") ? C.signalOn : C.phoneIdle);
		if (hot.has("phone") && ((t / 200) | 0) % 2) {
			px(c, item.x + 4, item.y - 11, 2, 2, C.activeAccent);
			px(c, item.x + 26, item.y - 11, 2, 2, C.activeAccent);
		}
	}

	function drawMeetingTable(c, item) {
		if (rich) px(c, item.x + 4, item.y + 5, item.w, item.h + 2, C.objectShadow);
		px(c, item.x, item.y + item.h, item.w, 3, C.woodDark);
		if (rich) outline(c, item.x - 1, item.y - 1, item.w + 2, item.h + 3);
		px(c, item.x, item.y, item.w, item.h, C.deskTop);
		px(c, item.x, item.y, item.w, 2, C.deskLite);
		if (rich) {
			px(c, item.x + 7, item.y + 5, item.w - 14, 1, C.woodGrain);
			px(c, item.x + 3, item.y + item.h, 5, 7, C.woodDark);
			px(c, item.x + item.w - 8, item.y + item.h, 5, 7, C.woodDark);
		}
		px(c, item.x + 8, item.y + 8, 12, 8, C.paper);
		px(c, item.x + item.w - 24, item.y + 6, 10, 10, C.meetingPaper);
		px(c, item.x + (item.w >> 1) - 4, item.y + 9, 8, 6, C.meetingDevice);
	}

	function drawLoungeSofa(c, item) {
		px(c, item.x + 4, item.y + 5, item.w, item.h + 2, C.objectShadow);
		px(c, item.x, item.y, item.w, item.h, C.outline);
		px(c, item.x + 3, item.y + 3, item.w - 6, item.h - 6, C.chair);
		px(c, item.x + 3, item.y + 3, item.w - 6, 7, C.chairDark);
		px(c, item.x + 2, item.y + 4, 7, item.h - 8, C.chairDark);
		px(c, item.x + item.w - 9, item.y + 4, 7, item.h - 8, C.chairDark);
		const cushionWidth = Math.floor((item.w - 22) / 3);
		for (let i = 0; i < 3; i++) {
			const x = item.x + 10 + i * cushionWidth;
			px(c, x, item.y + 11, cushionWidth - 2, item.h - 15, C.chairLite);
			px(c, x, item.y + 11, cushionWidth - 2, 1, C.metalLite);
		}
		px(c, item.x + 8, item.y + item.h, 5, 3, C.chairDark);
		px(c, item.x + item.w - 13, item.y + item.h, 5, 3, C.chairDark);
	}

	function drawDumbbell(c, item) {
		const vertical = item.orientation === "vertical";
		if (vertical) {
			px(c, item.x + 5, item.y, 6, 3, C.outline);
			px(c, item.x + 6, item.y + 1, 4, 2, C.metalLite);
			px(c, item.x + 7, item.y + 3, 2, item.h + 3, C.metal);
			px(c, item.x + 5, item.y + item.h + 4, 6, 3, C.outline);
			px(c, item.x + 6, item.y + item.h + 4, 4, 2, C.metalLite);
			return;
		}
		px(c, item.x, item.y + 1, 4, item.h - 2, C.outline);
		px(c, item.x + 1, item.y + 2, 3, item.h - 4, C.metalLite);
		px(c, item.x + 4, item.y + 3, item.w - 8, 2, C.metal);
		px(c, item.x + item.w - 4, item.y + 1, 4, item.h - 2, C.outline);
		px(c, item.x + item.w - 4, item.y + 2, 3, item.h - 4, C.metalLite);
	}

	function drawPlant(c, item) {
		if (rich) px(c, item.x - 5, item.y + 4, 12, 5, C.objectShadow);
		px(c, item.x - 4, item.y, 8, 7, C.pot);
		px(c, item.x - 4, item.y, 8, 2, C.potLite);
		px(c, item.x - 1, item.y - 5, 2, 5, C.plantDark);
		px(c, item.x - 6, item.y - 11, 12, 7, C.plant);
		px(c, item.x - 4, item.y - 14, 8, 4, C.plant);
		px(c, item.x - 6, item.y - 11, 5, 3, C.plantDark);
		if (rich) {
			px(c, item.x - 7, item.y - 9, 4, 3, C.plantLite);
			px(c, item.x + 2, item.y - 13, 5, 4, C.plantLite);
			px(c, item.x - 1, item.y - 16, 3, 5, C.plantHighlight);
			px(c, item.x - 3, item.y + 2, 6, 1, C.potLite);
		}
	}

	let floorLayer = null;
	function drawCachedFloor(c) {
		if (!floorLayer) {
			floorLayer = document.createElement("canvas");
			floorLayer.width = W;
			floorLayer.height = H;
			const floorContext = floorLayer.getContext("2d", { alpha: false });
			floorContext.imageSmoothingEnabled = false;
			drawFloor(floorContext);
		}
		c.drawImage(floorLayer, 0, 0);
	}

	function drawCubicleCell(c, item) {
		px(c, item.x, item.y, item.w, 5, C.metalDark);
		px(c, item.x + 1, item.y, item.w - 2, 3, C.metal);
		px(c, item.x, item.y, 5, item.h, C.metalDark);
		px(c, item.x + 1, item.y + 1, 3, item.h - 2, C.metal);
		px(c, item.x + item.w - 5, item.y, 5, item.h, C.metalDark);
		px(c, item.x + item.w - 4, item.y + 1, 3, item.h - 2, C.metal);
	}

	function drawExecutiveDesk(c, item, hot) {
		px(c, item.x, item.y + item.h, item.w, 5, C.woodDark);
		px(c, item.x, item.y, item.w, item.h, C.deskTop);
		px(c, item.x, item.y, item.w, 2, C.deskLite);
		px(c, item.x + 20, item.y + 4, 26, item.h - 7, C.plantDark);
		px(c, item.x + 4, item.y - 12, 17, 13, C.metalDark);
		px(c, item.x + 5, item.y - 11, 15, 10, C.screen);
		const active = hot.has(`desk${item.seatIndex ?? 0}`);
		px(c, item.x + 7, item.y - 8, active ? 11 : 7, 1, active ? C.activeGreen : C.screenIdle);
		px(c, item.x + item.w - 15, item.y + 4, 9, 5, C.phoneDevice);
		px(c, item.x + item.w - 24, item.y - 9, 2, 11, C.activeAccent);
		px(c, item.x + item.w - 29, item.y - 11, 12, 4, C.plantDark);
	}

	function drawCopyStation(c, item, hot, t) {
		px(c, item.x, item.y + 12, item.w, item.h - 12, C.waterBody);
		px(c, item.x + 2, item.y, item.w - 4, 14, C.metalDark);
		px(c, item.x + 4, item.y + 2, item.w - 8, 8, C.screen);
		px(c, item.x + item.w - 6, item.y + 17, 3, 2, hot.has("archive") && ((t / 240) | 0) % 2 ? C.signalOn : C.signalOff);
		px(c, item.x + item.w - 2, item.y + 17, 7, 3, C.paper);
		px(c, item.x + item.w - 2, item.y + 17, 1, 10, C.paperLine);
	}

	function drawReceptionDesk(c, item, hot) {
		px(c, item.x, item.y, item.w, item.h, C.woodDark);
		px(c, item.x + 2, item.y + 2, item.w - 4, item.h - 4, C.wood);
		px(c, item.x, item.y, item.w, 3, C.deskLite);
		px(c, item.x + 8, item.y - 12, 18, 13, C.metalDark);
		px(c, item.x + 10, item.y - 10, 14, 9, C.screen);
		px(c, item.x + 12, item.y - 7, hot.has("phone") ? 10 : 6, 1, hot.has("phone") ? C.signalOn : C.screenIdle);
		px(c, item.x + item.w - 16, item.y - 6, 9, 7, C.phoneDevice);
	}

	function drawPresentationScreen(c, item, hot, t) {
		px(c, item.x, item.y, item.w, item.h, C.metalDark);
		px(c, item.x + 2, item.y + 2, item.w - 4, item.h - 4, C.screen);
		px(c, item.x + 7, item.y + 8, item.w / 2 - 14, 3, C.paper);
		for (let row = 0; row < 3; row++) {
			const y = item.y + 17 + row * 6;
			px(c, item.x + 7, y, 22, 2, [C.activeBlue, C.activeAccent, C.activeGreen][row]);
			px(c, item.x + 33, y, item.w / 2 - 42, 2, C.rackLine);
			const width = hot.has("whiteboard") ? 20 + (((t / 260) | 0) + row * 9) % 24 : 18 + row * 8;
			px(c, item.x + 33, y, width, 2, [C.activeBlue, C.activeAccent, C.activeGreen][row]);
		}
		px(c, item.x + item.w - 47, item.y + 9, 38, 24, C.rackPanel);
		for (let row = 0; row < 4; row++) {
			px(c, item.x + item.w - 42, item.y + 13 + row * 5, 6, 2, row % 2 ? C.activeRed : C.activeGreen);
			px(c, item.x + item.w - 32, item.y + 13 + row * 5, 18, 2, C.rackLine);
		}
	}

	function drawBoardroomTable(c, item) {
		const inset = Math.max(16, Math.round(item.w * 0.25));
		const cx = item.x + (item.w >> 1);
		px(c, cx - 6, item.y - 15, 12, 13, C.chairDark);
		px(c, cx - 4, item.y - 13, 8, 9, C.chair);
		px(c, cx - 8, item.y - 12, 2, 10, C.metalDark);
		px(c, cx + 6, item.y - 12, 2, 10, C.metalDark);
		if (rich) poly(c, [[item.x + inset + 4, item.y + 5], [item.x + item.w - inset + 4, item.y + 5], [item.x + item.w + 5, item.y + item.h + 5], [item.x + 5, item.y + item.h + 5]], C.objectShadow);
		poly(c, [[item.x + inset, item.y], [item.x + item.w - inset, item.y], [item.x + item.w, item.y + item.h], [item.x, item.y + item.h]], C.woodDark);
		poly(c, [[item.x + inset + 3, item.y], [item.x + item.w - inset - 3, item.y], [item.x + item.w - 7, item.y + item.h - 6], [item.x + 7, item.y + item.h - 6]], C.deskTop);
		poly(c, [[item.x + inset + 7, item.y + 4], [item.x + item.w - inset - 7, item.y + 4], [item.x + item.w - 18, item.y + item.h - 13], [item.x + 18, item.y + item.h - 13]], C.deskLite);
		poly(c, [[cx - 4, item.y + 10], [cx + 4, item.y + 10], [cx + 12, item.y + item.h - 20], [cx - 12, item.y + item.h - 20]], C.woodDark);
		if (rich) {
			for (let y = item.y + 18; y < item.y + item.h - 18; y += 20) {
				px(c, item.x + 25, y, item.w - 50, 1, C.woodGrain);
			}
			for (const [x, y, flip] of [
				[item.x + 43, item.y + 31, false],
				[item.x + item.w - 55, item.y + 31, true],
				[item.x + 27, item.y + 77, false],
				[item.x + item.w - 39, item.y + 77, true],
			]) {
				px(c, x, y, 11, 7, C.meetingPaper);
				px(c, x + 2, y + 2, 7, 1, C.paperLine);
				px(c, x + (flip ? -3 : 12), y + 1, 1, 6, C.activeBlue);
				px(c, x + (flip ? 13 : -5), y + 1, 4, 4, C.waterGlass);
				px(c, x + (flip ? 14 : -4), y + 2, 2, 1, C.waterLevel);
			}
			for (const y of [item.y + 22, item.y + 92]) {
				px(c, cx - 15, y, 30, 3, C.woodDark);
				px(c, cx - 11, y, 22, 1, C.activeAccent);
			}
		}
		const deviceY = item.y + Math.round(item.h * 0.56);
		px(c, cx - 11, deviceY, 22, 12, C.meetingDevice);
		px(c, cx - 5, deviceY + 3, 10, 5, C.phoneDevice);
		px(c, cx - 8, deviceY + 2, 2, 2, C.signalOn);
		px(c, cx + 6, deviceY + 2, 2, 2, C.signalOff);
	}

	function drawAvConsole(c, item, hot, t) {
		px(c, item.x, item.y, item.w, item.h, C.rack);
		px(c, item.x, item.y, item.w, 2, C.rackTrim);
		px(c, item.x + 6, item.y + 6, Math.floor(item.w * .42), 15, C.screen);
		px(c, item.x + 9, item.y + 10, Math.floor(item.w * .32), 2, hot.has("server") ? C.activeGreen : C.screenIdle);
		px(c, item.x + 9, item.y + 15, Math.floor(item.w * .23), 2, C.activeBlue);
		for (let x = item.x + 7; x < item.x + item.w - 7; x += 8) {
			px(c, x, item.y + item.h - 15, 4, 4, Math.sin(t / 190 + x) > 0 ? C.signalOn : C.signalOff);
		}
		px(c, item.x + 6, item.y + item.h - 7, item.w - 12, 4, C.metal);
	}

	function drawSideboard(c, item) {
		px(c, item.x, item.y, item.w, item.h, C.wood);
		px(c, item.x, item.y, item.w, 3, C.deskLite);
		px(c, item.x, item.y + item.h - 3, item.w, 3, C.woodDark);
		for (let x = item.x + 6; x < item.x + item.w - 6; x += 14) px(c, x, item.y - 4, 5, 5, C.paper);
	}

	function drawVendingMachine(c, item) {
		px(c, item.x, item.y, item.w, item.h, C.activeRed);
		px(c, item.x + 3, item.y + 3, item.w - 6, Math.max(8, item.h - 12), C.screen);
		for (let y = item.y + 6; y < item.y + item.h - 8; y += 5) px(c, item.x + 5, y, item.w - 10, 2, y % 2 ? C.activeAccent : C.activeGreen);
		px(c, item.x + 4, item.y + item.h - 6, item.w - 8, 3, C.phoneDevice);
	}

	function drawNoticeBoard(c, item) {
		px(c, item.x - 2, item.y - 2, item.w + 4, item.h + 4, C.woodDark);
		px(c, item.x, item.y, item.w, item.h, C.activeRed);
		px(c, item.x + 3, item.y + 3, item.w - 6, 2, C.activeAccent);
		for (let x = item.x + 5; x < item.x + item.w - 8; x += 14) {
			px(c, x, item.y + 8, 10, 11, C.paper);
			px(c, x + 2, item.y + 10, 6, 1, C.paperLine);
			px(c, x + 2, item.y + 13, 5, 1, C.paperLine);
			px(c, x + 2, item.y + 16, 7, 1, C.activeRed);
		}
	}

	function drawWallCalendar(c, item) {
		px(c, item.x - 1, item.y - 1, item.w + 2, item.h + 2, C.woodDark);
		px(c, item.x, item.y, item.w, 5, C.activeRed);
		px(c, item.x + 2, item.y + 2, item.w - 4, 1, C.activeAccent);
		px(c, item.x, item.y + 5, item.w, item.h - 5, C.paper);
		for (let y = item.y + 8; y < item.y + item.h - 2; y += 4) {
			for (let x = item.x + 2; x < item.x + item.w - 2; x += 4) px(c, x, y, 2, 2, C.paperLine);
		}
	}

	function drawCoatRack(c, item) {
		const cx = item.x + (item.w >> 1);
		px(c, cx - 1, item.y + 3, 3, item.h - 6, C.woodDark);
		px(c, cx - 5, item.y + 5, 11, 2, C.woodDark);
		px(c, item.x + 1, item.y + 4, 2, 6, C.woodDark);
		px(c, item.x + item.w - 3, item.y + 4, 2, 6, C.woodDark);
		px(c, item.x + 1, item.y + 9, 5, 14, C.chairDark);
		px(c, item.x, item.y + 11, 3, 9, C.chair);
		px(c, cx - 5, item.y + item.h - 3, 11, 3, C.woodDark);
	}

	function drawFloorFan(c, item, t) {
		const cx = item.x + (item.w >> 1);
		const cy = item.y + 8;
		px(c, cx - 7, cy - 7, 15, 15, C.metalDark);
		px(c, cx - 5, cy - 5, 11, 11, C.metalLite);
		px(c, cx, cy, 1, 1, C.phoneDevice);
		const flip = ((t / 260) | 0) % 2;
		if (flip) {
			px(c, cx - 4, cy - 1, 4, 2, C.chairDark);
			px(c, cx + 1, cy, 4, 2, C.chairDark);
			px(c, cx - 1, cy - 4, 2, 4, C.chairDark);
		} else {
			px(c, cx - 3, cy - 4, 3, 4, C.chairDark);
			px(c, cx, cy + 1, 3, 4, C.chairDark);
			px(c, cx - 4, cy + 1, 4, 2, C.chairDark);
		}
		px(c, cx, cy + 8, 2, item.h - 12, C.metalDark);
		px(c, cx - 5, item.y + item.h - 4, 12, 4, C.metalDark);
	}

	function drawOfficeClock(c, item, officeTime) {
		const { now } = officeTime;
		px(c, item.x, item.y, item.w, item.h, C.outline ?? C.woodDark);
		px(c, item.x + 2, item.y + 1, item.w - 4, item.h - 2, C.paper);
		px(c, item.x + 1, item.y + 2, item.w - 2, item.h - 4, C.paper);
		const cx = item.x + (item.w >> 1);
		const cy = item.y + (item.h >> 1);
		px(c, cx, item.y + 2, 1, 1, C.boardText);
		px(c, cx, item.y + item.h - 3, 1, 1, C.boardText);
		px(c, item.x + 2, cy, 1, 1, C.boardText);
		px(c, item.x + item.w - 3, cy, 1, 1, C.boardText);
		const minuteAngle = (now.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2;
		const hourAngle = (((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2 - Math.PI / 2;
		pixelLine(c, cx, cy, cx + Math.round(Math.cos(hourAngle) * 3), cy + Math.round(Math.sin(hourAngle) * 3), C.phoneDevice);
		pixelLine(c, cx, cy, cx + Math.round(Math.cos(minuteAngle) * 5), cy + Math.round(Math.sin(minuteAngle) * 5), C.activeRed);
		px(c, cx, cy, 1, 1, C.outline ?? C.phoneDevice);
	}

	function drawRestroomDoor(c, item) {
		px(c, item.x - 2, item.y - 2, item.w + 4, item.h + 4, C.outline);
		px(c, item.x, item.y, item.w, item.h, C.door);
		px(c, item.x + 3, item.y + 3, item.w - 6, item.h - 6, C.doorPanel);
		px(c, item.x + item.w - 6, item.y + 16, 2, 3, C.paper);
		const cx = item.x + (item.w >> 1);
		px(c, cx - 2, item.y + 7, 5, 5, C.paper);
		px(c, cx - 1, item.y + 12, 3, 7, C.paper);
		px(c, cx - 4, item.y + 13, 3, 2, C.paper);
		px(c, cx + 2, item.y + 13, 3, 2, C.paper);
		px(c, cx - 3, item.y + 19, 2, 5, C.paper);
		px(c, cx + 2, item.y + 19, 2, 5, C.paper);
	}

	function drawBossDesk(c, item) {
		px(c, item.x + 3, item.y + 4, item.w, item.h + 3, C.objectShadow);
		outline(c, item.x - 1, item.y - 1, item.w + 2, item.h + 3);
		px(c, item.x, item.y, item.w, item.h, C.deskTop);
		px(c, item.x, item.y, item.w, 2, C.deskLite);
		px(c, item.x + 3, item.y + item.h, 4, 5, C.woodDark);
		px(c, item.x + item.w - 7, item.y + item.h, 4, 5, C.woodDark);
		px(c, item.x + 4, item.y - 11, 17, 12, C.outline);
		px(c, item.x + 5, item.y - 10, 15, 9, C.screen);
		px(c, item.x + 7, item.y - 7, 10, 1, C.activeGreen);
		px(c, item.x + 7, item.y - 4, 7, 1, C.activeBlue);
		px(c, item.x + 24, item.y + 4, 6, 6, C.mug);
		px(c, item.x + 29, item.y + 5, 2, 3, C.mugLite);
	}

	function drawAutomaticLighting(c, officeTime) {
		if (!officeTime.dynamicTime) return;
		if (officeTime.phase === "night") px(c, 0, WALL_H, W, H - WALL_H, "rgba(8,13,29,0.16)");
		if (!officeTime.lightingOn) return;
		c.save();
		c.globalCompositeOperation = "screen";
		px(c, 0, WALL_H, W, H - WALL_H, officeTime.phase === "night" ? (C.roomLightNight ?? "rgba(255,210,112,0.13)") : (C.roomLightEvening ?? "rgba(255,220,150,0.07)"));
		c.restore();
	}

	function drawAreaLabels(c) {
		if (!AREAS.length) return;
		c.save();
		c.font = 'bold 7px ui-monospace, "PingFang SC", "Microsoft YaHei", sans-serif';
		c.textAlign = "left";
		c.textBaseline = "top";
		for (const area of AREAS) {
			const name = localize(area.name);
			const width = Math.ceil(c.measureText(name).width) + 6;
			px(c, area.x, area.y, width, 10, C.outline);
			px(c, area.x + 1, area.y + 1, width - 2, 8, C.wallBase ?? C.woodDark);
			px(c, area.x + 2, area.y + 2, 1, 6, C.activeAccent);
			c.fillStyle = C.paper;
			c.fillText(name, area.x + 4, area.y + 1);
		}
		c.restore();
	}

	function drawServiceCart(c, item) {
		px(c, item.x, item.y, item.w, item.h, C.metal);
		px(c, item.x, item.y, item.w, 2, C.metalLite);
		for (let y = item.y + 5; y < item.y + item.h - 4; y += 7) {
			px(c, item.x + 4, y, item.w - 8, 4, C.paper);
			px(c, item.x + 7, y + 1, Math.floor(item.w * .4), 1, C.activeBlue);
		}
		px(c, item.x + 5, item.y + item.h, 4, 3, C.phoneDevice);
		px(c, item.x + item.w - 9, item.y + item.h, 4, 3, C.phoneDevice);
	}

	function drawRoom(c, t, hot, occupiedSeats) {
		const officeTime = currentEnvironment();
		drawCachedFloor(c);
		drawWall(c, t, officeTime);
		for (const item of byRenderer("restroom-door")) drawRestroomDoor(c, item);
		for (const item of byRenderer("whiteboard")) drawWhiteboard(c, item, hot, t);
		for (const item of byRenderer("phone-table")) drawPhoneTable(c, item, hot, t);
		for (const item of byRenderer("archive-cabinet")) drawArchive(c, item, hot, t);
		for (const item of byRenderer("server-rack")) drawServerRack(c, item, hot, t);
		for (const item of byRenderer("coffee-machine")) drawCoffee(c, item, hot, t);
		for (const item of byRenderer("water-cooler")) drawWaterCooler(c, item, hot, t);
		for (const item of byRenderer("meeting-table")) drawMeetingTable(c, item);
		for (const item of byRenderer("lounge-sofa")) drawLoungeSofa(c, item);
		for (const item of byRenderer("dumbbell")) drawDumbbell(c, item);
		for (const item of byRenderer("plant")) drawPlant(c, item);
		for (const item of byRenderer("cubicle-cell")) drawCubicleCell(c, item);
		for (const item of byRenderer("executive-desk")) drawExecutiveDesk(c, item, hot);
		for (const item of byRenderer("copy-station")) drawCopyStation(c, item, hot, t);
		for (const item of byRenderer("reception-desk")) drawReceptionDesk(c, item, hot);
		for (const item of byRenderer("presentation-screen")) drawPresentationScreen(c, item, hot, t);
		for (const item of byRenderer("boardroom-table")) drawBoardroomTable(c, item);
		for (const item of byRenderer("av-console")) drawAvConsole(c, item, hot, t);
		for (const item of byRenderer("sideboard")) drawSideboard(c, item);
		for (const item of byRenderer("vending-machine")) drawVendingMachine(c, item);
		for (const item of byRenderer("notice-board")) drawNoticeBoard(c, item);
		for (const item of byRenderer("wall-calendar")) drawWallCalendar(c, item);
		for (const item of byRenderer("coat-rack")) drawCoatRack(c, item);
		for (const item of byRenderer("floor-fan")) drawFloorFan(c, item, t);
		for (const item of byRenderer("office-clock")) drawOfficeClock(c, item, officeTime);
		for (const item of byRenderer("service-cart")) drawServiceCart(c, item);
		for (const item of byRenderer("boss-desk")) drawBossDesk(c, item);
		for (const seat of SEATS) {
			if (seat.renderer === "cubicle-workstation") {
				drawCubicleSeat(c, seat, hot);
				drawChair(c, seat, occupiedSeats.has(seat.index));
			} else if (seat.renderer === "boardroom-seat") {
				drawBoardroomSeat(c, seat, hot, occupiedSeats.has(seat.index));
			} else if (seat.renderer === "executive-seat") {
				drawChair(c, seat, occupiedSeats.has(seat.index));
			} else {
				drawDesk(c, seat, hot);
				drawChair(c, seat, occupiedSeats.has(seat.index));
			}
		}
		drawAreaLabels(c);
		drawAutomaticLighting(c, officeTime);
	}

	return Object.freeze({
		...engine,
		FURNITURE,
		colors: C,
		px,
		drawRoom,
		content,
	});
}
