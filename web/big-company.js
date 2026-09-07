/**
 * Big Company visual prototype.
 *
 * View 1: a campus overview with visible work inside every building.
 * View 2: one click enters the current Agent's building, rendered like a
 * medium-company office with two or three floors visible at once.
 */
(() => {
	const canvas = document.getElementById("stage");
	const ctx = canvas.getContext("2d", { alpha: false });
	const Sprites = window.Sprites;
	const W = 640;
	const H = 360;
	let dpr = 1;
	let scale = 1;
	let offX = 0;
	let offY = 0;
	let view = "campus";
	let hoverCurrent = false;
	const requestedFloors = Number(new URLSearchParams(window.location.search).get("floors"));
	const floorCount = requestedFloors === 2 || requestedFloors === 3 ? requestedFloors : Math.random() < 0.5 ? 2 : 3;

	const C = {
		void: "#080c13",
		skyTop: "#111d2d",
		skyBottom: "#25384c",
		groundA: "#273c38",
		groundB: "#2c443e",
		path: "#58616b",
		pathEdge: "#323b45",
		road: "#202936",
		roadLine: "#c9a947",
		building: "#222d3c",
		buildingLite: "#344357",
		buildingEdge: "#101722",
		floor: "#334150",
		floorAlt: "#374756",
		floorLine: "#2a3542",
		wall: "#1c2634",
		glass: "#45647f",
		glassLite: "#7aa0bb",
		wood: "#85613e",
		woodLite: "#a57d51",
		woodDark: "#5a3f29",
		metal: "#546274",
		metalDark: "#303b4b",
		screen: "#0d1621",
		accent: "#f3c955",
		ok: "#67d9a2",
		blue: "#78aaf0",
		purple: "#b18bea",
		ink: "#d6e0ed",
		dim: "#728197",
		plant: "#397a50",
		plantDark: "#28583a",
		paper: "#e7dfcc",
	};

	const buildings = [
		{ id: "rd", code: "A", name: "研发中心", x: 34, y: 75, w: 206, h: 178, floors: floorCount, people: 24, current: true, tone: "#314358" },
		{ id: "product", code: "B", name: "产品中心", x: 264, y: 111, w: 138, h: 142, floors: 3, people: 16, tone: "#3b3f55" },
		{ id: "data", code: "C", name: "数据中心", x: 426, y: 82, w: 176, h: 171, floors: 4, people: 19, tone: "#29434b" },
		{ id: "ops", code: "D", name: "运营中心", x: 55, y: 273, w: 154, h: 54, floors: 1, people: 13, tone: "#3e3b43" },
		{ id: "commons", code: "E", name: "综合服务", x: 264, y: 274, w: 170, h: 53, floors: 1, people: 11, tone: "#4a4034" },
	];
	const currentBuilding = buildings[0];

	const px = (x, y, w, h, color) => {
		ctx.fillStyle = color;
		ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
	};

	function poly(points, color, stroke = null) {
		ctx.beginPath();
		ctx.moveTo(points[0][0] | 0, points[0][1] | 0);
		for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] | 0, points[i][1] | 0);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
		if (stroke) {
			ctx.strokeStyle = stroke;
			ctx.lineWidth = 1;
			ctx.stroke();
		}
	}

	function text(value, x, y, color = C.ink, size = 5, align = "left") {
		ctx.fillStyle = color;
		ctx.font = `${size}px ui-monospace, Menlo, monospace`;
		ctx.textAlign = align;
		ctx.textBaseline = "top";
		ctx.fillText(value, x, y);
	}

	function resize() {
		const rect = canvas.parentElement.getBoundingClientRect();
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.max(1, Math.floor(rect.width * dpr));
		canvas.height = Math.max(1, Math.floor(rect.height * dpr));
		// The concept view must remain legible inside a narrow embedded WebView.
		// Fractional device-pixel scaling fills the available stage; the artwork
		// itself is still authored on the same integer-pixel logical grid.
		scale = Math.max(0.6, Math.min(canvas.width / W, canvas.height / H));
		offX = Math.floor((canvas.width - W * scale) / 2);
		offY = Math.floor((canvas.height - H * scale) / 2);
	}
	window.addEventListener("resize", resize);

	function drawCampus(t) {
		const sky = ctx.createLinearGradient(0, 0, 0, 190);
		sky.addColorStop(0, C.skyTop);
		sky.addColorStop(1, C.skyBottom);
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, W, H);

		// Distant city silhouette.
		for (let i = 0; i < 24; i++) {
			const bw = 10 + ((i * 7) % 18);
			const bh = 18 + ((i * 13) % 48);
			const bx = i * 28 - 8;
			px(bx, 128 - bh, bw, bh, i % 2 ? "#172536" : "#19293a");
			for (let wy = 128 - bh + 7; wy < 124; wy += 9) {
				if ((i + wy) % 3) px(bx + 4, wy, 2, 2, "#52677a");
			}
		}

		// Campus landscape. Angled paths establish the 2.5D ground plane.
		px(0, 126, W, 234, C.groundA);
		for (let y = 132; y < H; y += 16) {
			for (let x = 0; x < W; x += 16) {
				if (((x + y) / 16) % 3 === 0) px(x, y, 16, 16, C.groundB);
			}
		}
		poly([[0, 252], [640, 252], [640, 274], [0, 268]], C.pathEdge);
		poly([[0, 257], [640, 257], [640, 268], [0, 264]], C.path);
		poly([[212, 126], [237, 126], [279, 333], [239, 333]], C.pathEdge);
		poly([[218, 126], [232, 126], [268, 333], [247, 333]], C.path);
		poly([[389, 126], [406, 126], [453, 333], [425, 333]], "rgba(71,82,91,0.65)");
		px(0, 333, W, 27, C.road);
		for (let x = 8; x < W; x += 34) px(x, 345, 18, 2, C.roadLine);

		// Trees behind and between buildings.
		for (const [x, y] of [[16, 150], [249, 155], [412, 158], [614, 151], [18, 294], [224, 300], [449, 298], [610, 304]]) tree(x, y);

		for (const building of buildings) drawCampusBuilding(building, t);

		// Small moving life signals make the campus feel active.
		const shuttleX = 18 + ((t / 32) % 650);
		px(shuttleX, 337, 20, 8, "#d7dde5");
		px(shuttleX + 3, 334, 12, 4, C.glass);
		px(shuttleX + 3, 345, 4, 2, "#10151e");
		px(shuttleX + 14, 345, 4, 2, "#10151e");

		miniPerson(246, 282, "#547fb4", t, true);
		miniPerson(455, 312, "#9b7041", t + 700, false);
		miniPerson(471, 312, "#a65858", t + 1200, false);
		text("NOVA AI · HEADQUARTERS CAMPUS", 320, 13, "#9eabbc", 6, "center");
	}

	function tree(x, y) {
		poly([[x - 9, y + 8], [x + 3, y + 3], [x + 12, y + 7], [x, y + 12]], "rgba(5,9,12,0.25)");
		px(x - 2, y, 4, 10, "#654a31");
		px(x - 7, y - 13, 14, 15, C.plantDark);
		px(x - 5, y - 17, 10, 12, C.plant);
	}

	function drawCampusBuilding(b, t) {
		const active = b.current;
		const pulse = Math.sin(t / 420) > -0.1;
		const depth = b.floors === 1 ? 7 : 11;
		const lift = b.floors === 1 ? 5 : 9;

		// Long cast shadow on the campus ground.
		poly([
			[b.x + 6, b.y + b.h + 4],
			[b.x + b.w + depth + 6, b.y + b.h - lift + 4],
			[b.x + b.w + depth + 28, b.y + b.h + 13],
			[b.x + 26, b.y + b.h + 15],
		], "rgba(3,7,11,0.34)");

		// Roof and right side form a shallow isometric extrusion. The front stays
		// open so the distant work scenes remain readable.
		poly([
			[b.x, b.y],
			[b.x + depth, b.y - lift],
			[b.x + b.w + depth, b.y - lift],
			[b.x + b.w, b.y],
		], active ? "#53627a" : "#455267", active ? "#7b6a37" : "#5c6879");
		poly([
			[b.x + b.w, b.y],
			[b.x + b.w + depth, b.y - lift],
			[b.x + b.w + depth, b.y + b.h - lift],
			[b.x + b.w, b.y + b.h],
		], active ? "#27374a" : "#202c3b", "#101722");

		// Side-face windows align with the visible front floors.
		if (b.floors > 1) {
			const sideTop = b.y + 22;
			const sideH = b.h - 33;
			const sfh = Math.floor(sideH / b.floors);
			for (let floor = 0; floor < b.floors; floor++) {
				const sy = sideTop + floor * sfh;
				poly([
					[b.x + b.w + 2, sy + 2],
					[b.x + b.w + depth - 2, sy - lift + 3],
					[b.x + b.w + depth - 2, sy + sfh - lift - 4],
					[b.x + b.w + 2, sy + sfh - 3],
				], "#345068");
			}
		}

		if (active) {
			ctx.strokeStyle = pulse ? C.accent : "#8e7738";
			ctx.lineWidth = hoverCurrent ? 3 : 2;
			ctx.strokeRect(b.x - 4, b.y - lift - 4, b.w + depth + 8, b.h + lift + 8);
		}
		px(b.x, b.y, b.w, b.h, C.buildingEdge);
		px(b.x + 4, b.y + 7, b.w - 8, b.h - 11, b.tone);
		px(b.x - 3, b.y, b.w + 6, 8, C.buildingLite);
		px(b.x + 2, b.y + 8, 3, b.h - 16, "rgba(123,153,180,0.22)");
		px(b.x + 5, b.y + b.h - 8, b.w - 10, 8, C.building);

		const titleY = b.y + 11;
		text(`${b.code} · ${b.name}`, b.x + 9, titleY, active ? C.accent : "#aab5c4", 5);
		text(`${b.people}`, b.x + b.w - 10, titleY, C.ok, 5, "right");

		const insideTop = b.y + 22;
		const insideH = b.h - 33;
		const fh = Math.floor(insideH / b.floors);
		for (let floor = 0; floor < b.floors; floor++) {
			const fy = insideTop + floor * fh;
			drawCutawayFloor(b.x + 8, fy, b.w - 16, fh - 3, floor, b.id, t);
		}

		if (active) {
			const label = hoverCurrent ? "点击进入研发中心" : "阿派在这里 · 点击进入";
			const labelW = hoverCurrent ? 84 : 92;
			px(b.x + (b.w - labelW) / 2, b.y - 21, labelW, 13, "rgba(10,14,21,0.94)");
			px(b.x + (b.w - labelW) / 2, b.y - 21, 3, 13, C.accent);
			text(label, b.x + b.w / 2 + 1, b.y - 17, C.accent, 5, "center");
			px(b.x + b.w / 2 - 2, b.y - 8, 5, 4, C.accent);
		}
	}

	function drawCutawayFloor(x, y, w, h, floor, seed, t) {
		px(x, y, w, h, "#121c27");
		px(x + 3, y + 3, w - 6, h - 5, floor % 2 ? "#263442" : "#2a3947");
		px(x + 3, y + 3, 3, h - 5, "rgba(7,12,18,0.35)");
		px(x, y + h - 2, w, 2, "#18222e");
		px(x, y, w, 2, C.glassLite);
		const bays = Math.max(2, Math.floor(w / 31));
		const bayW = Math.floor(w / bays);
		for (let i = 0; i < bays; i++) {
			const bx = x + i * bayW;
			px(bx, y, 1, h, "#182330");
			px(bx + 3, y + 4, bayW - 6, Math.max(5, h - 9), "rgba(73,100,121,0.23)");
			const deskY = y + h - 8;
			px(bx + 6, deskY, Math.max(7, bayW - 12), 3, C.wood);
			if ((i + floor) % 3 !== 1) {
				const shirt = ["#4f9d69", "#4a78c8", "#c8913f", "#b8574f", "#7b57b8"][(i + floor + seed.length) % 5];
				miniPerson(bx + bayW / 2, deskY, shirt, t + i * 170 + floor * 240, false);
				const blink = Math.sin(t / 170 + i * 2 + floor) > 0;
				px(bx + bayW / 2 - 3, deskY - 5, 7, 4, C.screen);
				if (blink) px(bx + bayW / 2 - 2, deskY - 4, 4, 1, C.ok);
			}
		}
	}

	function miniPerson(x, y, shirt, t, walking) {
		const bob = Math.sin(t / 220) > 0.2 ? 0 : 1;
		const py = y - 1 + (walking ? bob : 0);
		px(x - 2, py - 5, 4, 4, shirt);
		px(x - 1, py - 9, 3, 4, "#d7a77e");
		px(x - 2, py - 10, 4, 2, "#2b2630");
		px(x - 2, py - 1, 1, 2, "#202937");
		px(x + 1, py - 1, 1, 2, "#202937");
	}

	function drawDetail(t) {
		px(0, 0, W, H, C.void);
		const gap = 8;
		const top = 17;
		const bottom = 330;
		const floorH = Math.floor((bottom - top - gap * (floorCount - 1)) / floorCount);
		for (let i = 0; i < floorCount; i++) {
			const y = top + i * (floorH + gap);
			drawDetailFloor(i, y, floorH, t);
		}
		text(`研发中心 · ${floorCount} 层办公区域`, 320, 4, "#91a0b4", 6, "center");
	}

	const floorSets = [
		{ no: "3F", title: "AI PLATFORM · API · ARCHITECTURE", zones: ["AI 平台", "API 小组", "架构评审"] },
		{ no: "2F", title: "FRONTEND · QUALITY · COLLABORATION", zones: ["前端研发", "质量保障", "协作会议"] },
		{ no: "1F", title: "DEV EXPERIENCE · LAB · COMMONS", zones: ["开发体验", "测试实验室", "茶水休息"] },
	];

	function activeFloorSets() {
		return floorCount === 2
			? [{ ...floorSets[0], no: "2F" }, floorSets[2]]
			: floorSets;
	}

	function drawDetailFloor(index, y, h, t) {
		const set = activeFloorSets()[index];
		const x = 12;
		const w = 616;
		const depth = 7;
		const lift = 5;
		poly([[x, y], [x + depth, y - lift], [x + w + depth, y - lift], [x + w, y]], "#46566c", "#607087");
		poly([[x + w, y], [x + w + depth, y - lift], [x + w + depth, y + h - lift], [x + w, y + h]], "#1c2735", "#101722");
		poly([[x + 5, y + h], [x + w, y + h], [x + w + depth, y + h - lift], [x + 14, y + h + 4]], "rgba(3,7,11,0.36)");
		px(x - 3, y - 1, w + 6, h + 3, "#2a3548");
		px(x, y, w, h, C.floor);
		px(x, y, w, 15, C.wall);
		text(set.no, x + 7, y + 5, C.accent, 6);
		text(set.title, x + 32, y + 6, "#8593a7", 5);

		for (let fy = y + 15; fy < y + h; fy += 12) {
			for (let fx = x; fx < x + w; fx += 12) {
				px(fx, fy, Math.min(12, x + w - fx), Math.min(12, y + h - fy), ((fx / 12 + fy / 12) | 0) % 2 ? C.floor : C.floorAlt);
			}
		}

		const inner = { x: x + 6, y: y + 20, w: w - 12, h: h - 25 };
		if (index === 0) drawEngineeringLayout(inner, index, set, t);
		else if (index === floorCount - 1) drawCommonsLayout(inner, index, set, t);
		else drawProductLayout(inner, index, set, t);
	}

	function drawEngineeringLayout(r, index, set, t) {
		// Open team area, a recessed server nook and an irregular glass meeting
		// room. Desk offsets deliberately break the showroom-like grid.
		detailRug(r.x + 17, r.y + 13, 294, r.h - 20, "#344958");
		detailAreaLabel(r.x + 4, r.y + 2, set.zones[0]);
		detailZone(r.x + 337, r.y + 5, 116, r.h - 5, set.zones[1]);
		detailZone(r.x + 460, r.y, 144, r.h, set.zones[2]);

		const deskY = r.y + r.h - 32;
		const roomy = r.h > 90;
		const desks = [
			{ x: r.x + 34, dy: 0 },
			{ x: r.x + 86, dy: roomy ? -27 : -5 },
			{ x: r.x + 139, dy: roomy ? -3 : 2 },
			{ x: r.x + 194, dy: roomy ? -24 : -3 },
			{ x: r.x + 248, dy: 3 },
			{ x: r.x + 301, dy: roomy ? -19 : -2 },
		];
		const roles = ["worker", "planner", "designer", "programmer", "reviewer", "writer"];
		for (let a = 0; a < desks.length; a++) {
			const d = desks[a];
			detailDesk(d.x, deskY + d.dy, a !== 4, t);
			const isCurrent = a === 1;
			const state = isCurrent ? "working" : a === 4 ? "waiting" : a % 3 === 0 ? "thinking" : "working";
			const actor = makeActor(`eng-${a}`, isCurrent ? "阿派" : roles[a], d.x, deskY + d.dy + 26, state, state === "waiting" ? "sit" : "type", isCurrent);
			Sprites.drawCharacter(ctx, actor, t);
			if (isCurrent) currentAgentLabel(actor.x, actor.y - 28, t);
		}

		detailWhiteboard(r.x + 234, r.y + 12, 84, t);
		detailPrinter(r.x + 9, r.y + 13, t);
		detailBin(r.x + 20, r.y + r.h - 15);
		indoorPlant(r.x + 320, r.y + r.h - 8);

		for (let i = 0; i < 3; i++) detailRack(r.x + 346 + i * 27, r.y + 19, t, i !== 1);
		Sprites.drawCharacter(ctx, makeActor(`tester-${index}`, "tester", r.x + 438, r.y + r.h - 7, "working", "reach", false), t);

		detailMeeting(r.x + 472, r.y + Math.max(25, r.h / 2 - 5), 118);
		Sprites.drawCharacter(ctx, makeActor(`meet-${index}-1`, "cpo", r.x + 493, r.y + r.h - 7, "talking", "talk", false), t);
		Sprites.drawCharacter(ctx, makeActor(`meet-${index}-2`, "reviewer", r.x + 568, r.y + r.h - 7, "talking", "talk", false, "left"), t);
		indoorPlant(r.x + 594, r.y + r.h - 8);
	}

	function drawProductLayout(r, index, set, t) {
		// A more startup-like studio: desk islands, a standing whiteboard and a
		// soft discussion corner instead of three equal rectangular rooms.
		detailRug(r.x + 14, r.y + 13, 242, r.h - 20, "#3e4657");
		detailAreaLabel(r.x + 3, r.y + 3, set.zones[0]);
		detailZone(r.x + 278, r.y, 188, r.h, set.zones[1]);
		detailRug(r.x + 481, r.y + 15, 113, r.h - 22, "#4a4052");
		detailAreaLabel(r.x + 478, r.y + 7, set.zones[2]);

		const baseY = r.y + r.h - 31;
		const islands = [
			{ x: r.x + 35, dy: -4, role: "designer" },
			{ x: r.x + 91, dy: 3, role: "writer" },
			{ x: r.x + 151, dy: -2, role: "cpo" },
			{ x: r.x + 219, dy: 2, role: "programmer" },
		];
		for (let i = 0; i < islands.length; i++) {
			const d = islands[i];
			detailDesk(d.x, baseY + d.dy, true, t + i * 90);
			Sprites.drawCharacter(ctx, makeActor(`product-${index}-${i}`, d.role, d.x, baseY + d.dy + 26, i === 2 ? "thinking" : "working", i === 2 ? "sit" : "type", false), t);
		}
		detailCabinet(r.x + 8, r.y + 13, 34, 24);
		detailBin(r.x + 245, r.y + r.h - 15);
		indoorPlant(r.x + 260, r.y + r.h - 8);

		detailWhiteboard(r.x + 294, r.y + 11, 150, t + 500);
		detailMeeting(r.x + 301, r.y + Math.max(34, r.h - 27), 124);
		Sprites.drawCharacter(ctx, makeActor(`standup-${index}`, "planner", r.x + 450, r.y + r.h - 7, "thinking", "reach", false, "left"), t);

		detailSofa(r.x + 486, r.y + r.h - 25, 47, "#4d5570");
		detailSofa(r.x + 548, r.y + r.h - 25, 39, "#59634e");
		px(r.x + 530, r.y + r.h - 19, 17, 9, C.wood);
		Sprites.drawCharacter(ctx, makeActor(`chat-${index}-1`, "writer", r.x + 517, r.y + r.h - 7, "idle", "talk", false, "right"), t);
		Sprites.drawCharacter(ctx, makeActor(`chat-${index}-2`, "designer", r.x + 564, r.y + r.h - 7, "idle", "talk", false, "left"), t);
	}

	function drawCommonsLayout(r, index, set, t) {
		// Entry and service functions make this feel like a lived-in real office.
		detailRug(r.x + 7, r.y + 11, 116, r.h - 18, "#40505b");
		detailAreaLabel(r.x + 3, r.y + 2, "前台与门禁");
		detailAreaLabel(r.x + 143, r.y + 5, set.zones[1]);
		detailRug(r.x + 381, r.y + 12, 213, r.h - 19, "#4b414e");
		detailAreaLabel(r.x + 378, r.y + 2, "茶水 · 休息 · 娱乐");

		const roomy = r.h > 90;
		detailReception(r.x + 17, r.y + 23, 78);
		const receptionist = makeNpc(`reception-${index}`, "reception", r.x + 55, r.y + (roomy ? 63 : r.h - 7), "stand");
		Sprites.drawCharacter(ctx, receptionist, t);
		npcLabel("前台", receptionist.x, receptionist.y - 23);
		const security = makeNpc(`security-${index}`, "security", r.x + 112 + Math.round(Math.sin(t / 1200) * 9), r.y + r.h - (roomy ? 24 : 7), "walk", "left");
		security.walkPhase = t / 220;
		Sprites.drawCharacter(ctx, security, t);
		npcLabel("保安", security.x, security.y - 23);
		indoorPlant(r.x + 9, r.y + r.h - 8);

		const labY = r.y + r.h - 31;
		for (const [i, dx] of [30, 88, 153].entries()) {
			const stagger = roomy ? [-2, -27, 3][i] : (i === 1 ? -4 : 2);
			detailDesk(r.x + 139 + dx, labY + stagger, true, t + i * 80);
			Sprites.drawCharacter(ctx, makeActor(`lab-${index}-${i}`, i === 1 ? "tester" : "worker", r.x + 139 + dx, labY + stagger + 26, "working", "type", false), t);
		}
		detailCabinet(r.x + 148, r.y + 13, 42, 25);
		detailPrinter(r.x + 335, r.y + 16, t + 200);
		const cleaner = makeNpc(`cleaner-${index}`, "cleaner", r.x + 350 + Math.round(Math.sin(t / 1600) * 8), r.y + r.h - (roomy ? 21 : 7), "walk", "left");
		cleaner.walkPhase = t / 260;
		Sprites.drawCharacter(ctx, cleaner, t);
		npcLabel("保洁", cleaner.x, cleaner.y - 23);

		detailCafe(r.x + 382, r.y + 13, r.h - 13);
		waterCooler(r.x + 490, r.y + 14);
		detailSofa(r.x + 509, r.y + r.h - 25, 46, "#5b506d");
		gameCabinet(r.x + 565, r.y + 15, t);
		Sprites.drawCharacter(ctx, makeActor(`life-${index}-1`, "writer", r.x + 428, r.y + r.h - 7, "idle", "talk", false, "right"), t);
		Sprites.drawCharacter(ctx, makeActor(`life-${index}-2`, "designer", r.x + 457, r.y + r.h - 7, "idle", "talk", false, "left"), t);
		const courier = makeNpc(`courier-${index}`, "courier", r.x + 580, r.y + r.h - 7, "stand", "left");
		Sprites.drawCharacter(ctx, courier, t);
		npcLabel("快递", courier.x, courier.y - 23);
	}

	function detailAreaLabel(x, y, title) {
		text(title, x + 4, y + 2, "#91a0b4", 4);
		px(x + 4, y + 8, Math.max(18, title.length * 5), 1, "rgba(122,160,187,0.42)");
	}

	function detailRug(x, y, w, h, color) {
		px(x, y, w, Math.max(5, h), color);
		for (let rx = x + 5; rx < x + w - 3; rx += 13) px(rx, y + Math.max(3, h - 3), 7, 1, "rgba(214,224,237,0.08)");
	}

	function detailZone(x, y, w, h, title) {
		ctx.fillStyle = "rgba(10,15,22,0.14)";
		ctx.fillRect(x, y, w, h);
		ctx.strokeStyle = C.glass;
		ctx.lineWidth = 1;
		ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
		px(x, y, w, 8, "rgba(17,24,34,0.82)");
		text(title, x + 4, y + 2, "#91a0b4", 4);
	}

	function detailDesk(cx, y, hot, t) {
		poly([[cx - 15, y + 8], [cx + 15, y + 8], [cx + 11, y + 12], [cx - 18, y + 12]], "rgba(6,10,15,0.24)");
		px(cx - 15, y, 30, 8, C.wood);
		px(cx - 15, y, 30, 2, C.woodLite);
		px(cx - 13, y + 8, 26, 2, C.woodDark);
		px(cx - 7, y - 7, 14, 8, C.metalDark);
		px(cx - 6, y - 6, 12, 6, C.screen);
		if (hot) {
			px(cx - 4, y - 4, 8, 1, Math.sin(t / 170 + cx) > 0 ? C.ok : C.blue);
			px(cx - 4, y - 2, 5, 1, C.blue);
		}
		px(cx - 5, y + 12, 10, 4, C.metalDark);
	}

	function detailRack(x, y, t, hot) {
		px(x, y, 21, 34, "#202936");
		px(x, y, 21, 2, "#465366");
		for (let i = 0; i < 4; i++) {
			const ry = y + 4 + i * 7;
			px(x + 2, ry, 17, 5, "#111923");
			px(x + 4, ry + 2, 7, 1, "#334155");
			px(x + 15, ry + 1, 2, 2, Math.sin(t / (hot ? 100 : 430) + i) > 0 ? C.ok : "#244b3a");
		}
	}

	function detailWhiteboard(x, y, w, t) {
		px(x - 1, y - 1, w + 2, 19, "#758296");
		px(x, y, w, 17, "#d9e0e7");
		px(x + 4, y + 4, w - 12, 1, "#566779");
		px(x + 4, y + 8, 24 + (((t / 500) | 0) % 18), 1, "#cc5c55");
		px(x + 4, y + 12, w - 22, 1, "#567db5");
	}

	function detailMeeting(x, y, w) {
		px(x, y, w, 13, C.wood);
		px(x, y, w, 2, C.woodLite);
		px(x + 7, y + 5, 10, 5, C.paper);
		px(x + w - 20, y + 4, 12, 6, "#566477");
	}

	function detailCafe(x, y, h) {
		px(x, y, 102, 15, "#394558");
		px(x + 5, y + 4, 18, 8, C.screen);
		px(x + 29, y + 4, 16, 8, "#6d4a31");
		text("COFFEE", x + 53, y + 5, "#b99b70", 4);
		const tableY = y + Math.max(29, h - 20);
		px(x + 23, tableY, 48, 9, C.wood);
		px(x + 19, tableY - 2, 4, 12, C.metalDark);
		px(x + 71, tableY - 2, 4, 12, C.metalDark);
	}

	function indoorPlant(x, y) {
		px(x - 4, y, 8, 7, "#8b5b3d");
		px(x - 1, y - 7, 2, 7, C.plantDark);
		px(x - 7, y - 14, 14, 9, C.plant);
		px(x - 4, y - 17, 8, 6, C.plantDark);
	}

	function detailPrinter(x, y, t) {
		px(x, y, 24, 16, C.metal);
		px(x + 3, y - 3, 18, 6, "#cbd3dc");
		px(x + 5, y + 5, 14, 5, C.metalDark);
		px(x + 18, y + 3, 2, 2, Math.sin(t / 300) > 0 ? C.ok : "#355345");
		px(x + 5, y + 13, 14, 5, C.paper);
	}

	function detailBin(x, y) {
		px(x, y, 10, 12, "#354252");
		px(x - 1, y, 12, 2, "#69778a");
		px(x + 2, y + 4, 6, 1, "#202a37");
	}

	function detailCabinet(x, y, w, h) {
		px(x, y, w, h, C.metal);
		for (let row = 0; row < 3; row++) {
			const ry = y + 3 + row * Math.floor((h - 3) / 3);
			px(x + 3, ry, w - 6, 5, C.metalDark);
			px(x + Math.floor(w / 2) - 3, ry + 2, 6, 1, "#8591a1");
		}
	}

	function detailSofa(x, y, w, color) {
		px(x, y, w, 12, color);
		px(x + 3, y - 4, w - 6, 6, color);
		px(x, y + 10, w, 3, "#31394a");
		px(x + 6, y + 2, 1, 8, "rgba(15,20,28,0.3)");
		px(x + w - 7, y + 2, 1, 8, "rgba(15,20,28,0.3)");
	}

	function detailReception(x, y, w) {
		poly([[x, y], [x + w, y], [x + w - 7, y + 12], [x + 7, y + 12]], C.wood, C.woodLite);
		px(x + 10, y - 9, 18, 10, C.metalDark);
		px(x + 11, y - 8, 16, 8, C.screen);
		px(x + w - 28, y - 7, 15, 8, C.paper);
	}

	function waterCooler(x, y) {
		px(x + 3, y, 10, 12, "#6f8498");
		px(x, y + 10, 16, 16, C.metal);
		px(x + 4, y + 14, 3, 2, C.blue);
		px(x + 9, y + 14, 3, 2, "#df7470");
		px(x + 5, y + 20, 6, 4, C.metalDark);
	}

	function gameCabinet(x, y, t) {
		px(x, y, 24, 31, "#263348");
		px(x + 3, y + 4, 18, 12, C.screen);
		px(x + 5, y + 6, 5, 4, Math.sin(t / 240) > 0 ? C.accent : C.blue);
		px(x + 13, y + 9, 5, 4, C.purple);
		px(x + 6, y + 20, 12, 3, C.metalDark);
		px(x + 8, y + 25, 3, 2, C.ok);
		px(x + 14, y + 25, 3, 2, "#df7470");
	}

	function makeActor(id, name, x, y, state, pose, isLead, dir = "down") {
		return {
			id,
			name,
			x,
			y,
			state,
			pose,
			dir,
			palette: Sprites.paletteFor(id, name, isLead),
			seed: Sprites.hash(id) % 7,
			walkPhase: 0,
		};
	}

	function makeNpc(id, role, x, y, pose = "stand", dir = "down") {
		const actor = makeActor(id, role, x, y, "idle", pose, false, dir);
		const uniforms = {
			security: { shirt: "#45658b", trim: "#293f5a", badge: "#a4bddc" },
			cleaner: { shirt: "#4c8d87", trim: "#2d625e", badge: "#9bd6cf" },
			reception: { shirt: "#9b7251", trim: "#684b35", badge: "#e0bd8f" },
			courier: { shirt: "#a27639", trim: "#704d23", badge: "#f0c46b" },
		};
		Object.assign(actor.palette, uniforms[role] ?? {});
		return actor;
	}

	function npcLabel(label, x, y) {
		const w = 9 + label.length * 5;
		px(x - w / 2, y, w, 8, "rgba(8,12,18,0.9)");
		text(label, x, y + 2, "#aebdd0", 4, "center");
	}

	function currentAgentLabel(x, y, t) {
		const pulse = Math.sin(t / 350) > -0.1;
		px(x - 24, y - 1, 48, 9, "rgba(8,12,18,0.94)");
		px(x - 24, y - 1, 2, 9, pulse ? C.accent : "#8c7536");
		text("阿派 · 当前", x, y + 1, C.accent, 4, "center");
	}

	function setView(next) {
		view = next;
		hoverCurrent = false;
		canvas.classList.toggle("is-clickable", next === "campus");
		document.getElementById("back").classList.toggle("visible", next === "detail");
		document.getElementById("hint").classList.toggle("hidden", next === "detail");
		if (next === "campus") {
			document.getElementById("viewTitle").innerHTML = "<small>CAMPUS OVERVIEW</small><b>NOVA AI 总部园区</b>";
			document.getElementById("viewMeta").textContent = "5 BUILDINGS · 83 PEOPLE";
			document.getElementById("currentLocation").textContent = `阿派 · 研发中心 ${floorCount === 2 ? "2F" : "3F"} · 正在修改 API`;
			renderCampusSide();
		} else {
			document.getElementById("viewTitle").innerHTML = `<small>BUILDING VIEW · MEDIUM COMPANY</small><b>A 栋 · 研发中心 · ${floorCount} 层同屏</b>`;
			document.getElementById("viewMeta").textContent = `${floorCount} FLOORS · 24 PEOPLE`;
			document.getElementById("currentLocation").textContent = "阿派 · AI 平台组 · 正在修改 API";
			renderDetailSide();
		}
	}

	function renderCampusSide() {
		document.getElementById("sideEyebrow").textContent = "BIG COMPANY · CAMPUS";
		document.getElementById("sideTitle").textContent = "NOVA AI";
		document.getElementById("sideCount").textContent = "83";
		document.getElementById("sideCountLabel").textContent = "园区人物";
		document.getElementById("sideContent").innerHTML = `
			<section class="panel">
				<h2>园区建筑</h2>
				<div class="building-row current"><span class="building-code">A</span><span class="building-name"><b>研发中心</b><small>阿派 · ${floorCount === 2 ? "2F" : "3F"} · AI 平台</small></span><span class="metric busy">24 活跃</span></div>
				<div class="building-row"><span class="building-code">B</span><span class="building-name"><b>产品中心</b><small>设计 · 产品 · 研究</small></span><span class="metric">16 活跃</span></div>
				<div class="building-row"><span class="building-code">C</span><span class="building-name"><b>数据中心</b><small>基础设施 · 质量</small></span><span class="metric busy">19 活跃</span></div>
				<div class="building-row"><span class="building-code">D</span><span class="building-name"><b>运营中心</b><small>客户 · 内容 · 市场</small></span><span class="metric">13 活跃</span></div>
				<div class="building-row"><span class="building-code">E</span><span class="building-name"><b>综合服务</b><small>前台 · 餐饮 · 行政</small></span><span class="metric dim">11 日常</span></div>
			</section>
			<section class="panel">
				<h2>当前工作</h2>
				<div class="agent-row"><span class="avatar lead"></span><div><b>阿派</b><small>研发中心 ${floorCount === 2 ? "2F" : "3F"} · API 改造</small></div><span class="state working">工作</span></div>
				<div class="agent-row"><span class="avatar green"></span><div><b>worker-2</b><small>产品中心 2F · 页面集成</small></div><span class="state working">工作</span></div>
				<div class="agent-row"><span class="avatar purple"></span><div><b>tester</b><small>数据中心 1F · 回归测试</small></div><span class="state testing">测试</span></div>
			</section>
			<div class="view-note"><b>两个视角</b><br>远处能看到每栋楼都在工作；点击金色标记的研发中心，进入清晰的多层办公区域。</div>`;
	}

	function renderDetailSide() {
		document.getElementById("sideEyebrow").textContent = "MEDIUM COMPANY VIEW";
		document.getElementById("sideTitle").textContent = "研发中心";
		document.getElementById("sideCount").textContent = "24";
		document.getElementById("sideCountLabel").textContent = "楼内人物";
		const sets = activeFloorSets();
		document.getElementById("sideContent").innerHTML = `
			<section class="panel">
				<h2>同屏楼层</h2>
				${sets.map((f, i) => `<div class="floor-row"><span class="floor-no">${f.no}</span><span class="floor-name"><b>${f.zones[0]} · ${f.zones[1]}</b><small>${i === 0 ? "阿派所在楼层" : f.zones[2]}</small></span><span class="metric ${i === 0 ? "busy" : ""}">${i === 0 ? "工作中" : "活跃"}</span></div>`).join("")}
			</section>
			<section class="panel">
				<h2>当前楼内 Agent</h2>
				<div class="agent-row"><span class="avatar lead"></span><div><b>阿派</b><small>AI 平台 · API 改造</small></div><span class="state working">工作</span></div>
				<div class="agent-row"><span class="avatar green"></span><div><b>programmer</b><small>API 小组 · 实现接口</small></div><span class="state working">工作</span></div>
				<div class="agent-row"><span class="avatar purple"></span><div><b>tester</b><small>测试实验室 · 回归测试</small></div><span class="state testing">测试</span></div>
				<div class="agent-row"><span class="avatar red"></span><div><b>reviewer</b><small>架构评审 · 等待变更</small></div><span class="state waiting">等待</span></div>
			</section>
			<section class="panel">
				<h2>楼内 NPC</h2>
				<div class="life-row"><span>◆</span><b>前台</b><small>接待访客</small></div>
				<div class="life-row"><span>◈</span><b>保安</b><small>入口巡逻</small></div>
				<div class="life-row"><span>✦</span><b>保洁</b><small>楼层巡回</small></div>
				<div class="life-row"><span>▣</span><b>快递员</b><small>文件送达</small></div>
			</section>
			<section class="panel">
				<h2>Office Life</h2>
				<div class="life-row"><span>☕</span><b>茶水区</b><small>喝咖啡 · 闲聊</small></div>
				<div class="life-row"><span>▥</span><b>打印区</b><small>文档输出</small></div>
				<div class="life-row"><span>●</span><b>休息角</b><small>沙发讨论</small></div>
				<div class="life-row"><span>★</span><b>娱乐角</b><small>街机放松</small></div>
			</section>
			<div class="view-note">这是进入 Big Company 某栋楼后的唯一细节层：保留 <b>${floorCount} 层同时可见</b>，但每层按真实用途自然生长，不使用统一工位模板。</div>`;
	}

	function pointInCurrent(event) {
		const rect = canvas.getBoundingClientRect();
		const dx = (event.clientX - rect.left) * dpr;
		const dy = (event.clientY - rect.top) * dpr;
		const x = (dx - offX) / scale;
		const y = (dy - offY) / scale;
		return x >= currentBuilding.x - 6 && x <= currentBuilding.x + currentBuilding.w + 6 && y >= currentBuilding.y - 24 && y <= currentBuilding.y + currentBuilding.h + 6;
	}

	canvas.addEventListener("mousemove", (event) => {
		if (view !== "campus") return;
		hoverCurrent = pointInCurrent(event);
		canvas.classList.toggle("is-clickable", hoverCurrent);
	});
	canvas.addEventListener("mouseleave", () => {
		hoverCurrent = false;
		canvas.classList.remove("is-clickable");
	});
	canvas.addEventListener("click", (event) => {
		if (view === "campus" && pointInCurrent(event)) setView("detail");
	});
	document.getElementById("back").addEventListener("click", () => setView("campus"));
	window.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && view === "detail") setView("campus");
	});

	function updateClock() {
		const d = new Date();
		document.getElementById("clock").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
	}

	function render(t) {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = C.void;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.setTransform(scale, 0, 0, scale, offX, offY);
		if (view === "campus") drawCampus(t);
		else drawDetail(t);
		requestAnimationFrame(render);
	}

	resize();
	updateClock();
	setInterval(updateClock, 15_000);
	setView("campus");
	requestAnimationFrame(render);
})();
