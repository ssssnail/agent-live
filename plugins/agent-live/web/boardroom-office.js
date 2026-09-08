(() => {
	const canvas = document.getElementById("stage");
	const c = canvas.getContext("2d", { alpha: false });
	const R = 1.5;
	const C = {
		floor: "#39434a", floorAlt: "#3e4950", floorLine: "#303940",
		wall: "#242d33", wallTop: "#12181c", trim: "#52616a",
		glass: "#526f7c", glassLite: "#7596a0", skyline: "#29373f",
		wood: "#85573a", woodLite: "#aa7650", woodDark: "#553523",
		leather: "#4b5961", leatherLite: "#65737b", leatherDark: "#2c353b",
		metal: "#68757d", metalLite: "#8d9aa0", metalDark: "#354148",
		screen: "#101b21", screenBlue: "#56a6c4", cyan: "#64c4ca",
		gold: "#d6ae58", green: "#6eac80", red: "#c45f56", purple: "#9b78ba",
		paper: "#e9e5d8", ink: "#e8eef1", dim: "#8da0a9", black: "#172026",
		coffee: "#66422e", shadow: "rgba(0,0,0,.30)",
	};

	const px = (x, y, w, h, color) => {
		c.fillStyle = color;
		c.fillRect(
			Math.round(x * R),
			Math.round(y * R),
			Math.max(1, Math.floor(w * R)),
			Math.max(1, Math.floor(h * R)),
		);
	};
	const box = (x, y, w, h, fill, edge = C.metalDark) => {
		px(x, y, w, h, edge);
		px(x + 1, y + 1, w - 2, h - 2, fill);
	};
	const poly = (points, color) => {
		c.beginPath();
		c.moveTo(Math.round(points[0][0] * R), Math.round(points[0][1] * R));
		for (let i = 1; i < points.length; i++) c.lineTo(Math.round(points[i][0] * R), Math.round(points[i][1] * R));
		c.closePath();
		c.fillStyle = color;
		c.fill();
	};

	function label(x, y, text, color) {
		const sx = Math.round(x * R);
		const sy = Math.round(y * R);
		c.font = "8px ui-monospace, Menlo, monospace";
		c.textBaseline = "top";
		c.textAlign = "left";
		const w = Math.ceil(c.measureText(text).width) + 10;
		c.fillStyle = "rgba(10,15,18,.86)";
		c.fillRect(sx, sy, w, 14);
		c.fillStyle = color;
		c.fillRect(sx, sy, 3, 14);
		c.fillStyle = C.ink;
		c.fillText(text, sx + 6, sy + 3);
	}

	function drawFloor() {
		px(0, 0, 384, 216, C.floor);
		for (let y = 54; y < 216; y += 12) {
			for (let x = 0; x < 384; x += 12) {
				if (((x / 12) + (y / 12)) % 2 === 0) px(x, y, 12, 12, C.floorAlt);
			}
		}
		for (let y = 54; y < 216; y += 12) px(0, y, 384, 1, C.floorLine);
		for (let x = 0; x < 384; x += 12) px(x, 54, 1, 162, C.floorLine);
	}

	function cityWindow(x, y, w, h, t) {
		box(x, y, w, h, C.glass, C.trim);
		px(x + 2, y + 2, w - 4, 5, C.glassLite);
		px(x + Math.floor(w / 2), y + 1, 1, h - 2, C.trim);
		for (let bx = x + 4; bx < x + w - 4; bx += 8) {
			const bh = 4 + ((bx * 7) % 11);
			px(bx, y + h - 2 - bh, 6, bh, C.skyline);
			if (Math.sin(t / 900 + bx) > .6) px(bx + 2, y + h - 5, 1, 1, C.gold);
		}
	}

	function mainScreen(t) {
		box(111, 6, 162, 43, C.screen, C.metalDark);
		px(114, 9, 156, 4, "#172831");
		px(118, 17, 62, 3, C.ink);
		px(118, 23, 38, 2, C.dim);
		// Three project tracks make the screen read as a working dashboard.
		for (const [i, row] of [0, 1, 2].entries()) {
			const y = 29 + row * 5;
			px(118, y, 22, 2, [C.cyan, C.gold, C.purple][i]);
			px(144, y, 74, 2, "#293a42");
			const animated = 22 + ((Math.floor(t / 650) + i * 17) % 36);
			px(144, y, animated, 2, [C.cyan, C.gold, C.green][i]);
		}
		// Diff / status column.
		px(226, 17, 37, 20, "#17262d");
		for (let y = 20; y < 34; y += 4) {
			px(230, y, 6, 2, y % 8 ? C.red : C.green);
			px(239, y, 18, 2, "#43545d");
		}
		px(184, 49, 16, 3, C.metalDark);
		label(114, 4, "LIVE TASK BOARD", C.cyan);
	}

	function drawShell(t) {
		px(0, 0, 384, 54, C.wall);
		px(0, 0, 384, 5, C.wallTop);
		cityWindow(9, 8, 91, 38, t);
		cityWindow(284, 8, 91, 38, t + 700);
		mainScreen(t);
		px(0, 51, 384, 4, C.trim);
		// Side walls create a more enclosed boardroom.
		px(0, 54, 8, 162, C.wall);
		px(8, 54, 3, 162, C.trim);
		px(376, 54, 8, 162, C.wall);
		px(373, 54, 3, 162, C.trim);
	}

	function whiteboard() {
		box(15, 64, 65, 45, C.paper, C.metalDark);
		px(20, 70, 25, 2, C.screenBlue);
		px(20, 77, 49, 1, C.dim);
		px(20, 82, 34, 1, C.dim);
		for (const [x, y, color] of [[22,89,C.gold],[33,89,C.cyan],[44,89,C.green],[55,89,C.red]]) px(x, y, 8, 7, color);
		px(19, 105, 56, 2, C.metal);
		label(16, 61, "DECISION WALL", C.gold);
	}

	function avConsole(t) {
		box(306, 64, 60, 45, "#283239", C.metalDark);
		box(312, 70, 24, 15, C.screen, C.black);
		px(315, 74, 18, 2, C.cyan);
		px(315, 79, 11, 2, C.green);
		for (let x = 312; x < 361; x += 7) px(x, 91, 4, 4, Math.sin(t / 220 + x) > .2 ? C.green : C.red);
		px(312, 99, 49, 4, C.metal);
		for (let x = 316; x < 358; x += 9) px(x, 100, 4, 2, C.black);
		label(307, 61, "AV / RECORDING", C.red);
	}

	function chair(x, y, side) {
		if (side === "left" || side === "right") {
			px(x - 4, y - 7, 8, 14, C.leatherDark);
			px(x - 3, y - 6, 6, 10, C.leather);
			px(x + (side === "left" ? 4 : -6), y - 5, 2, 10, C.metalDark);
		} else {
			px(x - 7, y - 4, 14, 8, C.leatherDark);
			px(x - 6, y - 3, 12, 6, C.leather);
			px(x - 5, y + (side === "top" ? 4 : -6), 10, 2, C.metalDark);
		}
		px(x - 1, y + 6, 2, 3, C.metalDark);
	}

	function laptop(x, y, side, active, t) {
		const w = 15;
		const h = 10;
		box(x, y, w, h, C.screen, C.metalDark);
		px(x + 2, y + 2, 11, 1, active ? C.cyan : "#35454d");
		px(x + 2, y + 5, active && Math.sin(t / 250 + x) > 0 ? 8 : 5, 1, active ? C.green : "#35454d");
		if (side === "left") px(x + w, y + 2, 2, h - 2, C.metalDark);
		if (side === "right") px(x - 2, y + 2, 2, h - 2, C.metalDark);
	}

	function coffeeCup(x, y, color = C.paper) {
		px(x, y, 4, 5, color);
		px(x + 4, y + 1, 2, 3, C.metalDark);
		px(x + 1, y, 2, 1, C.coffee);
	}

	function namePlate(x, y, w = 15) {
		px(x, y, w, 3, C.gold);
		px(x + 2, y + 1, w - 4, 1, C.woodDark);
	}

	function conferenceTable(t) {
		// Long table is the dominant visual. Its tapered shape supplies depth.
		poly([[142, 78], [242, 78], [302, 207], [82, 207]], C.woodDark);
		poly([[145, 76], [239, 76], [294, 201], [90, 201]], C.wood);
		poly([[149, 79], [235, 79], [281, 194], [103, 194]], C.woodLite);
		poly([[153, 82], [231, 82], [271, 190], [113, 190]], C.wood);

		// Recessed power/data spine.
		poly([[188, 88], [196, 88], [205, 184], [179, 184]], C.woodDark);
		poly([[190, 92], [194, 92], [200, 179], [184, 179]], C.metalDark);
		for (const y of [107, 133, 159]) {
			px(188 - Math.floor((y - 90) / 14), y, 9 + Math.floor((y - 90) / 7), 3, C.black);
			px(191, y + 1, 2, 1, C.gold);
		}

		const rows = [100, 128, 157, 187];
		rows.forEach((y, i) => {
			const spread = 35 + i * 10;
			const left = 192 - spread;
			const right = 192 + spread - 15;
			laptop(left, y - 7, "left", i !== 2, t + i * 170);
			laptop(right, y - 7, "right", true, t + i * 230);
			namePlate(left + 2, y + 7, 13);
			namePlate(right, y + 7, 13);
			coffeeCup(left + 18, y - 1, i % 2 ? "#bfd0d5" : C.paper);
			coffeeCup(right - 7, y - 1, i % 2 ? C.paper : "#bfd0d5");
			chair(192 - spread - 12, y, "left");
			chair(192 + spread + 12, y, "right");
		});

		// Speakerphone, shared documents, and the red hot-seat dossier.
		box(181, 144, 22, 12, C.metalDark, C.black);
		px(187, 147, 10, 5, C.black);
		for (const x of [183, 199]) px(x, 149, 2, 2, C.green);
		px(151, 167, 17, 12, C.paper);
		px(154, 170, 11, 1, C.blue);
		px(154, 174, 8, 1, C.dim);
		px(216, 166, 18, 12, C.red);
		px(219, 169, 12, 1, C.paper);
		px(219, 173, 8, 1, C.paper);
		label(92, 198, "SHARED BOARDROOM TABLE", C.gold);
	}

	function serviceEdges(t) {
		// Tea trolley, files, and sideboard keep the scene believable as a lived-in room.
		box(16, 129, 55, 13, C.wood, C.woodDark);
		px(19, 126, 49, 5, C.woodLite);
		for (const x of [21, 31, 41]) coffeeCup(x, 122, C.paper);
		box(53, 115, 12, 12, C.black, C.metalDark);
		px(56, 118, 6, 5, C.coffee);
		if (Math.sin(t / 330) > .1) px(59, 109, 1, 5, "rgba(220,235,235,.55)");
		// Mobile document trolley.
		box(18, 161, 50, 30, C.metal, C.metalDark);
		for (let y = 166; y < 187; y += 7) {
			px(22, y, 42, 4, C.paper);
			px(25, y + 1, 19, 1, y % 14 ? C.blue : C.red);
		}
		px(23, 191, 4, 3, C.black);
		px(59, 191, 4, 3, C.black);

		// Right-side room controller, printer, and coat cabinet.
		box(319, 125, 45, 19, C.wood, C.woodDark);
		box(323, 114, 20, 13, C.paper, C.metalDark);
		px(326, 118, 14, 2, C.black);
		px(348, 128, 11, 7, C.screen, C.black);
		px(350, 130, 7, 2, C.green);
		box(324, 157, 39, 42, C.wood, C.woodDark);
		px(343, 158, 2, 40, C.woodDark);
		px(338, 177, 2, 2, C.gold);
		px(348, 177, 2, 2, C.gold);
	}

	function speechBubble(t) {
		const x = 216;
		const y = 55;
		const w = 92;
		const h = 22;
		px(x, y, w, h, "rgba(11,17,20,.92)");
		px(x, y, w, 2, C.gold);
		px(x, y + h - 2, w, 2, C.metalDark);
		px(x - 5, y + 13, 5, 5, "rgba(11,17,20,.92)");
		px(x - 8, y + 16, 3, 3, "rgba(11,17,20,.92)");
		const sx = Math.round(x * R);
		const sy = Math.round(y * R);
		c.font = "8px ui-monospace, Menlo, monospace";
		c.textBaseline = "top";
		c.textAlign = "left";
		c.fillStyle = C.ink;
		c.fillText("先完成核心任务", sx + 8, sy + 6);
		const dots = 1 + (Math.floor(t / 420) % 3);
		c.fillStyle = C.gold;
		c.fillText(".".repeat(dots), sx + 8, sy + 17);
	}

	const people = [
		{ x: 192, y: 74, name: "老板", shirt: "#b28342", trim: "#76562f", dir: "down", boss: true },
		{ x: 145, y: 107, name: "research", shirt: "#4f8c83", trim: "#34645e", dir: "right" },
		{ x: 239, y: 107, name: "writer", shirt: "#687fa4", trim: "#465c7b", dir: "left" },
		{ x: 134, y: 136, name: "coder", shirt: "#627eaa", trim: "#405d88", dir: "right" },
		{ x: 250, y: 136, name: "reviewer", shirt: "#986b8e", trim: "#6d4b68", dir: "left" },
		{ x: 122, y: 166, name: "tester", shirt: "#a36652", trim: "#744637", dir: "right" },
		{ x: 262, y: 166, name: "planner", shirt: "#7774a7", trim: "#54527e", dir: "left" },
		{ x: 110, y: 197, name: "worker", shirt: "#5f8870", trim: "#426451", dir: "right" },
		{ x: 274, y: 197, name: "阿派", shirt: "#c28c41", trim: "#845d2e", dir: "left" },
		{ x: 72, y: 206, name: "秘书", shirt: "#568c83", trim: "#37645e", dir: "right", npc: true },
		{ x: 314, y: 207, name: "服务员", shirt: "#687779", trim: "#485658", dir: "left", npc: true },
	];

	function person(p, t) {
		const talking = p.boss && Math.sin(t / 260) > 0;
		const bob = !p.boss && Math.sin(t / 700 + p.x) > .86 ? 1 : 0;
		const x = p.x | 0;
		const y = (p.y + bob) | 0;
		px(x - 5, y - 1, 10, 2, C.shadow);
		px(x - 3, y - 5, 2, 5, C.black);
		px(x + 1, y - 5, 2, 5, C.black);
		px(x - 4, y - 12, 8, 8, p.shirt);
		px(x - 4, y - 12, 8, 1, p.trim);
		px(x - 4, y - 6, 8, 2, p.trim);
		px(x - 6 - (talking ? 3 : 0), y - 12 - (talking ? 2 : 0), talking ? 5 : 2, 5, p.shirt);
		px(x + 4, y - 11, 2, 5, p.shirt);
		px(x - 3, y - 19, 6, 7, "#d9a77a");
		px(x - 4, y - 20, 8, 4, p.npc ? "#575c59" : "#332a24");
		if (p.dir !== "up") px(x + (p.dir === "left" ? -2 : 1), y - 16, 1, 2, C.black);
		px(x - 1, y - 11, 2, 2, p.npc ? "#a7d8ca" : C.gold);

		const sx = Math.round(x * R);
		const sy = Math.round(y * R);
		c.font = "8px ui-monospace, Menlo, monospace";
		c.textAlign = "center";
		c.textBaseline = "bottom";
		const w = Math.ceil(c.measureText(p.name).width) + 6;
		c.fillStyle = p.boss ? "rgba(104,70,29,.92)" : "rgba(8,13,16,.78)";
		c.fillRect(Math.round(sx - w / 2), sy - 42, w, 12);
		c.fillStyle = p.npc ? "#b9dfd5" : C.ink;
		c.fillText(p.name, sx, sy - 31);
		c.textAlign = "left";
	}

	function render(t) {
		drawFloor();
		drawShell(t);
		whiteboard();
		avConsole(t);
		serviceEdges(t);
		conferenceTable(t);
		for (const p of [...people].sort((a, b) => a.y - b.y)) person(p, t);
		speechBubble(t);
		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);
})();
