(() => {
	const canvas = document.getElementById("stage");
	const c = canvas.getContext("2d", { alpha: false });
	const R = 1.5;
	const C = {
		floor: "#303d48", floorAlt: "#34434f", grid: "#29353f",
		wall: "#1c2632", wallTop: "#111923", trim: "#46586b",
		wood: "#936a43", woodLite: "#b08356", woodDark: "#65462f",
		metal: "#667483", metalLite: "#82909d", metalDark: "#394654",
		screen: "#0d1b25", screenIdle: "#1d3542", ink: "#dce6ef", dim: "#7f91a2",
		green: "#72bd90", blue: "#6ca6d8", yellow: "#e8bd59", red: "#d97062",
		purple: "#ad84cf", cyan: "#63c4c5", glass: "#75a5b6", glassLite: "#acd6dc",
		plant: "#4f956b", plantDark: "#34704d", paper: "#efe7d1", paperLine: "#c8c0ac",
		sofa: "#4d6e69", sofaDark: "#344f4b", fridge: "#d8e1e5", shadow: "rgba(0,0,0,.28)",
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

	function drawFloor() {
		px(0, 0, 384, 216, C.floor);
		for (let y = 36; y < 216; y += 12) {
			for (let x = 0; x < 384; x += 12) {
				if (((x / 12) + (y / 12)) % 2 === 0) px(x, y, 12, 12, C.floorAlt);
			}
		}
		for (let y = 36; y < 216; y += 12) px(0, y, 384, 1, C.grid);
		for (let x = 0; x < 384; x += 12) px(x, 36, 1, 180, C.grid);
	}

	function drawShell(t) {
		px(0, 0, 384, 36, C.wall);
		px(0, 0, 384, 6, C.wallTop);
		px(0, 33, 384, 3, C.trim);
		box(15, 6, 34, 30, "#755039", "#4d3425");
		px(42, 20, 2, 3, C.paper);
		for (const x of [68, 120, 172, 224, 276]) {
			box(x, 9, 40, 19, C.glass, C.trim);
			px(x + 2, 11, 36, 6, C.glassLite);
			px(x + 20, 10, 1, 17, C.trim);
			if (Math.sin(t / 850 + x) > 0.58) px(x + 7, 21, 2, 2, "#f7e5a3");
		}
		px(376, 36, 8, 180, C.wall);
		px(376, 36, 2, 180, C.trim);
	}

	function rug(x, y, w, h, color) {
		px(x, y, w, h, color);
		px(x, y, w, 1, "rgba(255,255,255,.10)");
		px(x, y + h - 1, w, 1, "rgba(0,0,0,.18)");
	}

	function monitor(x, y, active = false, wide = false, t = 0) {
		const w = wide ? 20 : 16;
		box(x, y, w, 11, C.screen, C.metalDark);
		px(x + 2, y + 2, w - 4, 1, active ? C.green : C.screenIdle);
		px(x + 2, y + 4, wide ? 11 : 8, 1, active ? C.blue : C.screenIdle);
		px(x + 2, y + 6, wide ? 14 : 10, 1, active && Math.sin(t / 220) > 0 ? C.yellow : C.screenIdle);
		px(x + (w >> 1) - 1, y + 11, 2, 2, C.metalDark);
	}

	function chair(x, y, dir = "up") {
		if (dir === "up" || dir === "down") {
			px(x - 6, y - 4, 12, 8, "#46566d"); px(x - 5, y + (dir === "up" ? 4 : -6), 10, 2, C.metalDark);
		} else {
			px(x - 4, y - 6, 8, 12, "#46566d"); px(x + (dir === "left" ? 4 : -6), y - 5, 2, 10, C.metalDark);
		}
	}

	function label(x, y, text, color) {
		const sx = Math.round(x * R);
		const sy = Math.round(y * R);
		c.font = "8px ui-monospace, Menlo, monospace";
		c.textBaseline = "top";
		c.textAlign = "left";
		const w = Math.ceil(c.measureText(text).width) + 10;
		c.fillStyle = "rgba(7,10,14,.86)";
		c.fillRect(sx, sy, w, 14);
		c.fillStyle = color;
		c.fillRect(sx, sy, 3, 14);
		c.fillStyle = C.ink;
		c.fillText(text, sx + 6, sy + 3);
	}

	function focusBench(t) {
		rug(13, 42, 169, 66, "#31435a");
		// acoustic divider and a real shared sit/stand bench
		px(18, 49, 158, 3, C.blue);
		px(18, 52, 2, 45, C.trim);
		px(174, 52, 2, 45, C.trim);
		px(23, 68, 146, 18, C.woodDark);
		px(23, 65, 146, 18, C.wood);
		px(23, 65, 146, 2, C.woodLite);
		for (const [i, x] of [31, 66, 101, 136].entries()) {
			monitor(x, 54, i === 1 || i === 3, false, t);
			px(x + 2, 74, 12, 3, "#222c37");
			px(x + 4, 75, 8, 1, C.blue);
			chair(x + 8, 94, "up");
			px(x + 19, 70, 5, 7, i % 2 ? C.paper : C.metalDark);
		}
		// cable spine makes this read as a tech bench
		px(28, 84, 136, 2, C.metalDark);
		for (let x = 34; x < 164; x += 26) px(x, 84, 2, 4, C.metal);
		label(17, 39, "FOCUS BENCH", C.blue);
	}

	function researchWall(t) {
		box(13, 113, 74, 27, "#34424d", C.metalDark);
		// books, archive trays and searchable wall display
		for (let i = 0; i < 7; i++) px(17 + i * 7, 118, 5, 12, [C.green, C.blue, C.yellow, C.red][i % 4]);
		px(16, 132, 67, 2, C.metalLite);
		box(91, 113, 45, 29, "#d9e0dd", C.metal);
		px(95, 118, 27, 2, C.dim);
		px(95, 123, 34, 2, C.blue);
		px(95, 128, 19 + (((t / 500) | 0) % 10), 2, C.green);
		label(13, 110, "RESEARCH WALL", C.green);
	}

	function glassRoom(t) {
		rug(191, 42, 109, 76, "#3a4053");
		// glass walls and a visible door gap
		px(190, 42, 111, 2, C.yellow);
		px(190, 42, 2, 76, C.trim);
		px(299, 42, 2, 76, C.trim);
		px(190, 116, 38, 2, C.trim);
		px(244, 116, 57, 2, C.trim);
		for (let x = 198; x < 295; x += 18) px(x, 43, 1, 73, "rgba(117,165,182,.42)");
		// wall display with sprint board
		box(207, 47, 77, 16, C.screen, C.metal);
		for (let i = 0; i < 5; i++) px(212 + i * 13, 52, 8, 5, [C.blue, C.yellow, C.green, C.red, C.purple][i]);
		// actual project table + six chairs
		px(211, 78, 70, 3, C.woodDark);
		px(207, 68, 78, 22, C.wood);
		px(211, 66, 70, 26, C.wood);
		px(211, 66, 70, 2, C.woodLite);
		px(221, 72, 12, 8, C.paper);
		px(254, 72, 16, 9, C.metalDark);
		px(256, 74, 12, 4, Math.sin(t / 350) > 0 ? C.green : C.screenIdle);
		for (const x of [220, 246, 272]) { chair(x, 61, "down"); chair(x, 98, "up"); }
		label(194, 39, "GLASS PROJECT ROOM", C.yellow);
	}

	function phoneBooths() {
		for (const [i, y] of [45, 82].entries()) {
			// enclosed booth, glass door, stool, small desk and headset
			px(311, y, 58, 34, C.purple);
			px(313, y + 2, 54, 32, "#2d3543");
			px(313, y + 2, 54, 5, "#424c5e");
			px(338, y + 7, 2, 27, C.purple);
			px(361, y + 20, 2, 10, C.glassLite);
			box(318, y + 16, 18, 8, C.wood, C.woodDark);
			monitor(320, y + 8, i === 0, false, 0);
			chair(350, y + 20, "left");
			px(351, y + 10, 7, 4, C.metalDark);
			px(349, y + 9, 2, 5, C.purple);
		}
		label(311, 39, "PHONE BOOTHS", C.purple);
	}

	function buildLab(t) {
		rug(13, 151, 129, 57, "#273a46");
		// ESD workbench with dual monitors, keyboard and tools
		px(18, 176, 78, 4, C.metalDark);
		px(18, 171, 78, 8, C.metal);
		px(18, 171, 78, 2, C.metalLite);
		monitor(24, 158, true, true, t);
		monitor(51, 158, true, true, t + 200);
		px(76, 161, 12, 4, C.screen);
		px(78, 162, 2, 2, C.red);
		px(83, 162, 2, 2, C.green);
		px(29, 174, 30, 2, "#202a33");
		px(67, 173, 3, 3, C.yellow);
		px(74, 173, 6, 2, C.red);
		// server / test rack
		box(104, 157, 29, 43, "#1c2831", C.metal);
		for (let i = 0; i < 4; i++) {
			px(108, 162 + i * 8, 21, 6, "#111b22");
			px(111, 164 + i * 8, 10, 1, C.screenIdle);
			px(125, 163 + i * 8, 2, 2, Math.sin(t / 150 + i) > 0 ? C.green : "#294938");
		}
		// wheeled parts cabinet
		box(17, 187, 34, 15, "#465564", C.metalDark);
		for (let i = 0; i < 3; i++) px(21, 190 + i * 4, 26, 2, C.metalLite);
		label(13, 148, "BUILD & TEST LAB", C.red);
	}

	function openProjectBay(t) {
		rug(149, 129, 117, 79, "#3c455b");
		// pin-up wall and physical sticky notes
		box(153, 136, 56, 26, "#dce2df", C.metal);
		for (const [x, y, color] of [[158,141,C.yellow],[169,141,C.blue],[180,141,C.green],[158,150,C.red],[176,151,C.yellow],[190,143,C.purple]]) px(x, y, 7, 5, color);
		// standing project table, laptops and stools
		px(168, 180, 83, 4, C.woodDark);
		px(164, 166, 91, 17, C.wood);
		px(164, 166, 91, 2, C.woodLite);
		box(177, 159, 18, 11, C.screen, C.metalDark);
		box(222, 159, 18, 11, C.screen, C.metalDark);
		px(180, 162, 12, 2, C.blue);
		px(225, 162, 12, 2, Math.sin(t / 300) > 0 ? C.green : C.screenIdle);
		px(201, 171, 13, 8, C.paper);
		for (const x of [173, 203, 237]) { chair(x, 193, "up"); }
		label(149, 126, "OPEN PROJECT BAY", C.yellow);
	}

	function pantryLounge(t) {
		rug(274, 126, 96, 82, "#304c4e");
		// L-shaped pantry counter with sink and coffee machine
		px(279, 139, 69, 14, C.woodDark);
		px(279, 136, 69, 14, C.wood);
		px(279, 136, 69, 2, C.woodLite);
		box(285, 128, 14, 10, C.metalDark, C.metal);
		px(288, 131, 8, 3, "#28323d");
		px(306, 139, 16, 7, C.metalDark);
		px(309, 140, 10, 4, C.glass);
		box(329, 125, 18, 26, C.fridge, C.metalDark);
		px(332, 128, 12, 9, "#b9d9dc");
		px(341, 139, 2, 3, C.red);
		if (((t / 280) | 0) % 2) px(292, 124, 2, 3, "#aebdc5");
		// water dispenser
		box(353, 130, 13, 23, C.fridge, C.metalDark);
		px(356, 132, 7, 7, C.glassLite);
		px(357, 134, 5, 3, C.cyan);
		px(356, 143, 3, 2, C.blue);
		px(361, 143, 3, 2, C.red);
		// recognizable sofa, coffee table and bar stools
		px(285, 169, 39, 18, C.sofaDark);
		px(282, 172, 45, 16, C.sofa);
		px(286, 176, 16, 8, "#5f827b");
		px(306, 176, 16, 8, "#5f827b");
		px(337, 175, 21, 13, C.woodDark);
		px(340, 172, 15, 17, C.wood);
		chair(286, 158, "up");
		chair(314, 158, "up");
		label(274, 123, "PANTRY LOUNGE", C.cyan);
	}

	function plant(x, y) {
		px(x - 4, y, 8, 7, "#9b6542");
		px(x - 1, y - 7, 2, 7, C.plantDark);
		px(x - 6, y - 13, 12, 8, C.plant);
		px(x - 3, y - 17, 7, 6, C.plant);
	}

	const people = [
		{ x: 76, y: 96, name: "reviewer", shirt: "#ad6d8e", trim: "#7d4967", pose: "sit", dir: "up" },
		{ x: 116, y: 145, name: "scout", shirt: "#63a67b", trim: "#407153", pose: "stand", dir: "up" },
		{ x: 244, y: 99, name: "designer", shirt: "#54aaa4", trim: "#397c76", pose: "talk", dir: "down" },
		{ x: 75, y: 198, name: "worker", shirt: "#5b89c2", trim: "#3c6090", pose: "reach", dir: "up" },
		{ x: 192, y: 190, name: "阿派", shirt: "#d39a45", trim: "#a76f2c", pose: "talk", dir: "right" },
		{ x: 231, y: 190, name: "planner", shirt: "#9a79c4", trim: "#6f5295", pose: "talk", dir: "left" },
		{ x: 350, y: 201, name: "林姨", shirt: "#4f9d88", trim: "#347264", pose: "stand", dir: "left", npc: true },
	];

	function person(p, t) {
		const bob = p.pose === "stand" && Math.sin(t / 600 + p.x) > 0.7 ? 1 : 0;
		const x = p.x | 0;
		const y = (p.y + bob) | 0;
		px(x - 5, y - 1, 10, 2, C.shadow);
		px(x - 3, y - 5, 2, 5, "#29313d");
		px(x + 1, y - 5, 2, 5, "#29313d");
		px(x - 4, y - 12, 8, 8, p.shirt);
		px(x - 4, y - 12, 8, 1, p.trim);
		px(x - 4, y - 6, 8, 2, p.trim);
		const arm = p.pose === "reach" ? 1 : 0;
		px(x - 6, y - 11 - arm, 2, 5, p.shirt);
		px(x + 4, y - 11, 2, 5, p.shirt);
		px(x - 3, y - 19, 6, 7, "#deb183");
		px(x - 4, y - 20, 8, 4, p.npc ? "#40434b" : "#30251d");
		if (p.dir !== "up") px(x + (p.dir === "left" ? -2 : 1), y - 16, 1, 2, "#28303a");
		px(x - 1, y - 11, 2, 2, p.npc ? "#b7eadb" : C.yellow);
		const sx = Math.round(x * R);
		const sy = Math.round(y * R);
		c.font = "8px ui-monospace, Menlo, monospace";
		c.textAlign = "center";
		c.textBaseline = "bottom";
		const w = Math.ceil(c.measureText(p.name).width) + 6;
		c.fillStyle = "rgba(6,9,13,.78)";
		c.fillRect(Math.round(sx - w / 2), sy - 42, w, 12);
		c.fillStyle = p.npc ? "#aee5d1" : C.ink;
		c.fillText(p.name, sx, sy - 31);
		c.textAlign = "left";
	}

	function render(t) {
		drawFloor();
		drawShell(t);
		focusBench(t);
		researchWall(t);
		glassRoom(t);
		phoneBooths();
		buildLab(t);
		openProjectBay(t);
		pantryLounge(t);
		for (const [x, y] of [[145, 105], [304, 118], [145, 205], [269, 205], [369, 205]]) plant(x, y);
		for (const p of [...people].sort((a, b) => a.y - b.y)) person(p, t);
		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);
})();
