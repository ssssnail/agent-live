(() => {
	const canvas = document.getElementById("stage");
	const c = canvas.getContext("2d", { alpha: false });
	const R = 1.5;
	const C = {
		carpet: "#8d806a", carpetAlt: "#958873", carpetLine: "#7d715f",
		wall: "#c8b894", wallShade: "#9b896b", wallTop: "#5d3f2e", trim: "#75563f",
		walnut: "#714630", walnutLite: "#956247", walnutDark: "#4b2e24",
		cubicle: "#75847f", cubicleLite: "#8f9a91", cubicleDark: "#52615f",
		beige: "#cbbd9d", beigeLite: "#e1d6bc", beigeDark: "#8f826b",
		metal: "#8c918d", metalLite: "#adb0aa", metalDark: "#5d6462",
		burgundy: "#733b3a", burgundyLite: "#92514e", navy: "#40536a",
		green: "#638268", greenDark: "#405b47", blue: "#67849a", gold: "#c99a48",
		red: "#ad5045", paper: "#eee5cb", ink: "#f4ead4", black: "#242522",
		screen: "#1c302c", screenGlow: "#6c9b78", shadow: "rgba(40,27,20,.28)",
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
	const box = (x, y, w, h, fill, edge = C.walnutDark) => {
		px(x, y, w, h, edge);
		px(x + 1, y + 1, w - 2, h - 2, fill);
	};

	function label(x, y, text, color) {
		const sx = Math.round(x * R);
		const sy = Math.round(y * R);
		c.font = "8px ui-monospace, Menlo, monospace";
		c.textBaseline = "top";
		c.textAlign = "left";
		const w = Math.ceil(c.measureText(text).width) + 10;
		c.fillStyle = "rgba(39,27,20,.88)";
		c.fillRect(sx, sy, w, 14);
		c.fillStyle = color;
		c.fillRect(sx, sy, 3, 14);
		c.fillStyle = C.ink;
		c.fillText(text, sx + 6, sy + 3);
	}

	function drawFloor() {
		px(0, 0, 384, 216, C.carpet);
		for (let y = 36; y < 216; y += 8) {
			for (let x = 0; x < 384; x += 8) {
				if (((x / 8) + (y / 8)) % 2 === 0) px(x, y, 8, 8, C.carpetAlt);
			}
		}
		for (let y = 36; y < 216; y += 8) px(0, y, 384, 1, "rgba(80,67,51,.13)");
		px(0, 211, 384, 5, C.wallTop);
	}

	function drawWindow(x, w) {
		box(x, 7, w, 23, "#718388", C.trim);
		px(x + 2, 9, w - 4, 5, "#9ca9a5");
		px(x + Math.floor(w / 2), 8, 1, 20, C.trim);
		// Venetian blinds are deliberately heavy: the clearest old-office signal.
		for (let y = 11; y < 28; y += 4) px(x + 2, y, w - 4, 1, "#d0c6aa");
	}

	function drawShell(t) {
		px(0, 0, 384, 36, C.wall);
		px(0, 0, 384, 5, C.wallTop);
		px(0, 33, 384, 3, C.trim);
		drawWindow(12, 55);
		drawWindow(75, 55);
		drawWindow(138, 55);
		drawWindow(201, 55);
		drawWindow(264, 55);
		// Framed company certificate and an analog clock.
		box(326, 8, 25, 19, C.paper, C.walnutDark);
		px(330, 12, 17, 2, C.gold);
		px(330, 17, 12, 1, C.beigeDark);
		px(330, 21, 15, 1, C.beigeDark);
		px(363, 10, 14, 14, C.paper, C.walnutDark);
		px(369, 12, 2, 5, C.black);
		const phase = Math.floor(t / 1000) % 4;
		px(370, 17, phase === 1 ? 4 : 1, phase === 2 ? 4 : 1, C.red);
		// Entry door and brass name strip.
		box(2, 6, 8, 30, C.walnut, C.walnutDark);
		px(7, 21, 1, 2, C.gold);
		px(0, 36, 384, 2, C.wallShade);
	}

	function rug(x, y, w, h, color) {
		px(x, y, w, h, color);
		px(x, y, w, 1, "rgba(255,255,255,.12)");
		px(x, y + h - 1, w, 1, "rgba(40,20,15,.25)");
	}

	function crt(x, y, active, t = 0) {
		box(x, y, 15, 12, C.beige, C.beigeDark);
		box(x + 2, y + 2, 11, 7, C.screen, C.black);
		if (active) {
			px(x + 4, y + 4, 7, 1, C.screenGlow);
			px(x + 4, y + 6, Math.sin(t / 260 + x) > 0 ? 5 : 8, 1, "#89b39a");
		}
		px(x + 6, y + 12, 3, 2, C.beigeDark);
		px(x + 4, y + 14, 7, 1, C.beigeDark);
	}

	function deskPhone(x, y, color = C.black) {
		px(x, y + 2, 8, 5, color);
		px(x + 1, y, 6, 2, color);
		px(x + 2, y + 4, 1, 1, C.beigeLite);
		px(x + 5, y + 4, 1, 1, C.beigeLite);
	}

	function tray(x, y) {
		px(x, y, 8, 1, C.beigeDark);
		px(x, y + 4, 8, 1, C.beigeDark);
		px(x, y, 1, 5, C.beigeDark);
		px(x + 7, y, 1, 5, C.beigeDark);
		px(x + 1, y + 1, 6, 1, C.paper);
	}

	function chair(x, y, dir = "up", color = C.burgundy) {
		if (dir === "up" || dir === "down") {
			px(x - 5, y - 4, 10, 8, color);
			px(x - 4, y + (dir === "up" ? 4 : -6), 8, 2, C.walnutDark);
		} else {
			px(x - 4, y - 5, 8, 10, color);
			px(x + (dir === "left" ? 4 : -6), y - 4, 2, 8, C.walnutDark);
		}
		px(x - 1, y + 4, 2, 3, C.metalDark);
	}

	function partitionH(x, y, w) {
		px(x, y, w, 5, C.cubicleDark);
		px(x + 1, y, w - 2, 3, C.cubicle);
		px(x + 1, y, w - 2, 1, C.cubicleLite);
	}

	function partitionV(x, y, h) {
		px(x, y, 5, h, C.cubicleDark);
		px(x + 1, y + 1, 3, h - 2, C.cubicle);
		px(x + 1, y + 1, 1, h - 2, C.cubicleLite);
	}

	function cubicleFloor(t) {
		rug(10, 41, 194, 99, "#827966");
		// Three paired cubicle pods. Low partitions keep the office busy and readable.
		for (const x of [16, 78, 140]) {
			partitionV(x, 52, 75);
			partitionV(x + 51, 52, 75);
			partitionH(x, 52, 56);
			partitionH(x, 88, 56);
			partitionH(x, 123, 56);

			// Top employee desk.
			px(x + 5, 60, 46, 9, C.beigeDark);
			px(x + 5, 58, 46, 9, C.beige);
			crt(x + 8, 43, true, t + x * 17);
			px(x + 25, 61, 12, 2, C.black);
			deskPhone(x + 39, 58);
			tray(x + 39, 69);
			chair(x + 27, 78, "up", C.navy);

			// Bottom employee desk.
			px(x + 5, 106, 46, 9, C.beigeDark);
			px(x + 5, 104, 46, 9, C.beige);
			crt(x + 8, 91, x !== 78, t + x * 11);
			px(x + 25, 107, 12, 2, C.black);
			deskPhone(x + 39, 104, x === 140 ? C.burgundy : C.black);
			px(x + 40, 115, 8, 5, C.paper);
			chair(x + 27, 119, "down", C.navy);
		}
		label(12, 39, "CUBICLE FLOOR", "#91b0a8");
	}

	function managerOffice(t) {
		rug(212, 41, 78, 92, "#7b614d");
		// Full-height walnut/glass enclosure and a visible doorway.
		px(211, 40, 80, 3, C.walnutDark);
		px(211, 40, 3, 93, C.walnutDark);
		px(289, 40, 3, 93, C.walnutDark);
		px(211, 130, 28, 3, C.walnutDark);
		px(251, 130, 41, 3, C.walnutDark);
		for (let x = 218; x < 287; x += 13) px(x, 41, 1, 12, "rgba(221,216,190,.45)");
		// Credenza and certificates.
		box(219, 48, 53, 12, C.walnut, C.walnutDark);
		for (const x of [222, 237, 252]) {
			box(x, 44, 11, 8, C.paper, C.walnutDark);
			px(x + 3, 47, 5, 1, C.gold);
		}
		// Large executive desk with blotter, phone and banker lamp.
		px(220, 85, 61, 5, C.walnutDark);
		px(216, 70, 69, 18, C.walnut);
		px(216, 70, 69, 2, C.walnutLite);
		px(235, 73, 25, 11, "#365448");
		crt(219, 58, true, t);
		deskPhone(268, 74, C.burgundy);
		px(262, 62, 2, 12, C.gold);
		px(257, 60, 12, 4, C.greenDark);
		px(259, 61, 8, 2, C.green);
		chair(250, 98, "up", C.burgundy);
		chair(228, 112, "up", C.greenDark);
		chair(274, 112, "up", C.greenDark);
		label(213, 39, "MANAGER OFFICE", C.gold);
	}

	function conferenceRoom(t) {
		rug(300, 41, 74, 92, "#655250");
		px(299, 40, 76, 3, C.walnutDark);
		px(299, 40, 3, 93, C.walnutDark);
		px(373, 40, 3, 93, C.walnutDark);
		px(299, 130, 31, 3, C.walnutDark);
		px(342, 130, 34, 3, C.walnutDark);
		// Whiteboard, flip chart, and a period TV/VCR cart.
		box(310, 46, 38, 15, C.paper, C.metalDark);
		px(314, 50, 18, 1, C.blue);
		px(314, 54, 27, 1, C.red);
		box(353, 46, 15, 13, C.black, C.metalDark);
		px(356, 49, 9, 6, Math.sin(t / 900) > .4 ? "#647779" : "#354443");
		px(354, 60, 13, 3, C.metalDark);
		// Formal mahogany boardroom table and six matching chairs.
		px(314, 78, 47, 5, C.walnutDark);
		px(310, 67, 55, 22, C.walnut);
		px(314, 65, 47, 26, C.walnut);
		px(314, 65, 47, 2, C.walnutLite);
		px(324, 72, 11, 7, C.paper);
		px(339, 73, 13, 5, C.burgundy);
		for (const x of [319, 338, 357]) {
			chair(x, 60, "down", C.burgundy);
			chair(x, 99, "up", C.burgundy);
		}
		label(301, 39, "CONFERENCE", C.blue);
	}

	function fileCabinet(x, y) {
		box(x, y, 12, 31, C.metal, C.metalDark);
		for (let i = 0; i < 4; i++) {
			px(x + 2, y + 3 + i * 7, 8, 5, C.metalLite);
			px(x + 5, y + 5 + i * 7, 3, 1, C.metalDark);
		}
	}

	function recordsAndCopy(t) {
		rug(10, 148, 83, 60, "#8e8169");
		fileCabinet(16, 157);
		fileCabinet(30, 157);
		fileCabinet(44, 157);
		// A copier with open lid and paper output.
		box(61, 169, 25, 26, C.beige, C.beigeDark);
		px(63, 157, 20, 13, C.beigeDark);
		px(65, 159, 16, 8, C.black);
		px(67, 160, 12, 5, "#777b75");
		px(84, 174, 5, 3, C.paper);
		px(84, 174, 1, 10, C.beigeDark);
		if (Math.sin(t / 380) > .7) px(66, 174, 2, 2, C.green);
		// Archive boxes along the wall.
		for (let i = 0; i < 5; i++) {
			box(16 + i * 14, 193, 12, 10, C.beige, C.beigeDark);
			px(19 + i * 14, 196, 6, 2, C.paper);
		}
		label(11, 146, "RECORDS / COPY", "#d2b887");
	}

	function computerRoom(t) {
		rug(100, 148, 78, 60, "#59605c");
		// Tall beige server/mainframe cabinets.
		for (const [i, x] of [106, 123, 140].entries()) {
			box(x, 155, 14, 38, C.beige, C.metalDark);
			for (let row = 0; row < 4; row++) {
				px(x + 3, 159 + row * 7, 8, 4, C.metalDark);
				px(x + 4, 160 + row * 7, 2, 1, Math.sin(t / 180 + i + row) > 0 ? C.green : C.red);
			}
		}
		// Operator console and continuous-form dot-matrix printout.
		box(157, 157, 15, 17, C.beige, C.beigeDark);
		box(160, 160, 9, 6, C.screen, C.black);
		px(156, 181, 19, 10, C.beige, C.beigeDark);
		px(159, 177, 13, 10, C.paper);
		for (let y = 179; y < 186; y += 2) px(161, y, 9, 1, C.beigeDark);
		px(159, 177, 1, 10, C.blue);
		px(171, 177, 1, 10, C.blue);
		label(101, 146, "COMPUTER ROOM", C.red);
	}

	function reception(t) {
		rug(185, 148, 82, 60, "#806a59");
		// Secretary station with return desk, CRT, switchboard, and in/out stack.
		px(191, 174, 61, 5, C.walnutDark);
		px(191, 166, 61, 11, C.walnut);
		px(191, 166, 61, 2, C.walnutLite);
		px(191, 177, 8, 23, C.walnut);
		crt(197, 152, true, t + 500);
		deskPhone(238, 168, C.burgundy);
		box(218, 154, 18, 12, C.beige, C.beigeDark);
		for (const [dx, dy, color] of [[3,3,C.red],[7,3,C.green],[11,3,C.gold],[5,7,C.blue],[10,7,C.red]]) px(218 + dx, 154 + dy, 2, 2, color);
		tray(240, 155);
		chair(220, 187, "up", C.burgundy);
		// Brass lobby directory and visitor chair.
		box(255, 154, 8, 23, C.walnut, C.walnutDark);
		px(257, 157, 4, 9, C.gold);
		chair(256, 195, "left", C.greenDark);
		label(186, 146, "RECEPTION", C.gold);
	}

	function waterCooler(x, y) {
		box(x, y + 8, 12, 20, C.beigeLite, C.beigeDark);
		box(x + 2, y, 8, 11, "#a4c1bc", C.metalDark);
		px(x + 3, y + 2, 6, 5, "#bdd3cc");
		px(x + 2, y + 14, 3, 2, C.blue);
		px(x + 7, y + 14, 3, 2, C.red);
	}

	function breakRoom(t) {
		rug(274, 140, 100, 68, "#69755e");
		// Bulletin board and institutional kitchenette.
		box(281, 146, 35, 16, "#9b7855", C.walnutDark);
		for (const [x, y, color] of [[284,149,C.paper],[295,150,C.gold],[304,148,C.paper],[287,155,C.blue],[300,156,C.red]]) px(x, y, 7, 5, color);
		px(320, 159, 45, 12, C.beigeDark);
		px(320, 156, 45, 12, C.beige);
		box(325, 146, 12, 11, C.black, C.metalDark);
		px(328, 149, 6, 4, "#7a4d34");
		px(340, 151, 8, 6, C.beigeLite);
		if (Math.sin(t / 300) > .2) px(330, 141, 1, 4, "rgba(240,232,209,.6)");
		waterCooler(279, 169);
		// A wood-panel vending machine.
		box(351, 174, 17, 28, C.burgundy, C.walnutDark);
		box(354, 177, 10, 14, C.black, C.walnutDark);
		for (let y = 179; y < 190; y += 4) px(356, y, 6, 2, [C.red, C.gold, C.green][(y / 4) % 3 | 0]);
		px(355, 195, 9, 3, C.black);
		// Round laminate table, ashtray, and vinyl chairs.
		px(307, 181, 34, 16, C.beigeDark);
		px(304, 178, 40, 16, C.beigeLite);
		px(315, 182, 18, 8, C.beige);
		px(322, 184, 3, 3, C.metalDark);
		chair(296, 188, "right", C.greenDark);
		chair(345, 188, "left", C.greenDark);
		label(275, 138, "BREAK ROOM", C.green);
	}

	const people = [
		{ x: 43, y: 81, name: "writer", shirt: "#657e96", trim: "#42596e", dir: "up" },
		{ x: 105, y: 81, name: "worker", shirt: "#a66a51", trim: "#754734", dir: "up" },
		{ x: 167, y: 81, name: "reviewer", shirt: "#6f8765", trim: "#4d6347", dir: "up" },
		{ x: 43, y: 123, name: "planner", shirt: "#876781", trim: "#664a60", dir: "down" },
		{ x: 167, y: 123, name: "analyst", shirt: "#b48650", trim: "#805e38", dir: "down" },
		{ x: 250, y: 99, name: "阿派", shirt: "#b7833e", trim: "#815a2b", dir: "up" },
		{ x: 338, y: 100, name: "review", shirt: "#586f89", trim: "#3d5267", dir: "up" },
		{ x: 165, y: 202, name: "operator", shirt: "#8b5a4f", trim: "#633f39", dir: "up" },
		{ x: 220, y: 194, name: "前台", shirt: "#718b78", trim: "#526a59", dir: "up", npc: true },
		{ x: 293, y: 202, name: "老周", shirt: "#6d8171", trim: "#4a5e50", dir: "right", npc: true },
	];

	function person(p, t) {
		const bob = Math.sin(t / 650 + p.x) > .82 ? 1 : 0;
		const x = p.x | 0;
		const y = (p.y + bob) | 0;
		px(x - 5, y - 1, 10, 2, C.shadow);
		px(x - 3, y - 5, 2, 5, C.black);
		px(x + 1, y - 5, 2, 5, C.black);
		px(x - 4, y - 12, 8, 8, p.shirt);
		px(x - 4, y - 12, 8, 1, p.trim);
		px(x - 4, y - 6, 8, 2, p.trim);
		px(x - 6, y - 11, 2, 5, p.shirt);
		px(x + 4, y - 11, 2, 5, p.shirt);
		px(x - 3, y - 19, 6, 7, "#d9aa7c");
		px(x - 4, y - 20, 8, 4, p.npc ? "#6b6256" : "#3e3028");
		if (p.dir !== "up") px(x + (p.dir === "left" ? -2 : 1), y - 16, 1, 2, C.black);
		px(x - 1, y - 11, 2, 2, p.npc ? "#a8d2b0" : C.gold);

		const sx = Math.round(x * R);
		const sy = Math.round(y * R);
		c.font = "8px ui-monospace, Menlo, monospace";
		c.textAlign = "center";
		c.textBaseline = "bottom";
		const w = Math.ceil(c.measureText(p.name).width) + 6;
		c.fillStyle = "rgba(43,29,21,.78)";
		c.fillRect(Math.round(sx - w / 2), sy - 42, w, 12);
		c.fillStyle = p.npc ? "#c2dbc4" : C.ink;
		c.fillText(p.name, sx, sy - 31);
		c.textAlign = "left";
	}

	function render(t) {
		drawFloor();
		drawShell(t);
		cubicleFloor(t);
		managerOffice(t);
		conferenceRoom(t);
		recordsAndCopy(t);
		computerRoom(t);
		reception(t);
		breakRoom(t);
		for (const p of [...people].sort((a, b) => a.y - b.y)) person(p, t);
		requestAnimationFrame(render);
	}

	requestAnimationFrame(render);
})();
