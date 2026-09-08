/**
 * Office map: layout, furniture rendering, and navigation data.
 *
 * Logical resolution is 384x216, drawn in integer pixels. The floor is laid out
 * around three horizontal lanes and four vertical connectors so characters can
 * always walk between any two anchors without crossing furniture.
 */
(() => {
	const W = 384;
	const H = 216;
	const WALL_H = 36;

	/** Horizontal walkways: top aisle, main aisle, lower aisle. */
	const LANES = [46, 100, 162];
	/** Vertical walkways, positioned in the gaps between desks. */
	const VCONN = [76, 140, 204, 276];

	const C = {
		floorA: "#2f3a45",
		floorB: "#334050",
		floorLine: "#28313b",
		rug: "#3a3150",
		rugEdge: "#4b3f63",
		wall: "#222b39",
		wallTop: "#1a222e",
		wallTrim: "#39455c",
		wood: "#7d5b3a",
		woodDark: "#5d4229",
		deskTop: "#8d6a44",
		deskLite: "#a07d54",
		screen: "#0f1620",
		chair: "#43506b",
		chairDark: "#333d52",
		metal: "#57616f",
		metalDark: "#3f4854",
		rack: "#232b3a",
		board: "#dde3ec",
		boardFrame: "#8f9aab",
		glass: "#5f87a8",
		glassLite: "#7fa8c9",
		plant: "#3f7d52",
		plantDark: "#2f5e3e",
		pot: "#8a5a3c",
		paper: "#e8e2d0",
		door: "#6b4a2f",
		doorDark: "#4c3421",
	};

	const px = (c, x, y, w, h, col) => {
		c.fillStyle = col;
		c.fillRect(x | 0, y | 0, w | 0, h | 0);
	};

	/** Eight desks in two rows; characters sit on the near side facing the monitor. */
	const SEATS = [];
	[
		[58, 84, 1],
		[118, 144, 2],
	].forEach(([deskY, sitY, lane], row) => {
		[44, 108, 172, 236].forEach((cx, col) => {
			SEATS.push({
				index: row * 4 + col,
				cx,
				deskX: cx - 24,
				deskY,
				deskW: 48,
				deskH: 16,
				anchor: { x: cx, y: sitY, dir: "up", lane },
			});
		});
	});

	const FURNITURE = {
		archive: { x: 296, y: 56, w: 44, h: 32 },
		server: { x: 296, y: 116, w: 48, h: 32 },
		coffee: { x: 300, y: 176, w: 26, h: 22 },
		phone: { x: 348, y: 40, w: 32, h: 14 },
		whiteboard: { x: 116, y: 8, w: 72, h: 26 },
		meeting: { x: 120, y: 176, w: 112, h: 26 },
	};

	const TARGETS = {
		archive: { x: 318, y: 100, dir: "up", lane: 1 },
		server: { x: 320, y: 158, dir: "up", lane: 2 },
		whiteboard: { x: 152, y: 46, dir: "up", lane: 0 },
		phone: { x: 364, y: 64, dir: "up", lane: 1 },
		coffee: { x: 290, y: 188, dir: "right", lane: 2 },
		meetA: { x: 108, y: 190, dir: "right", lane: 2 },
		meetB: { x: 244, y: 190, dir: "left", lane: 2 },
		entry: { x: 38, y: 46, dir: "down", lane: 0 },
	};

	const DOOR = { x: 20, y: 6, w: 36, h: 30 };
	const WINDOWS = [
		{ x: 208, y: 8, w: 44, h: 22 },
		{ x: 268, y: 8, w: 44, h: 22 },
	];
	const PLANTS = [
		{ x: 16, y: 200 },
		{ x: 78, y: 200 },
		{ x: 366, y: 200 },
	];

	function drawFloor(c) {
		px(c, 0, WALL_H, W, H - WALL_H, C.floorA);
		for (let y = WALL_H; y < H; y += 16) {
			for (let x = 0; x < W; x += 16) {
				if (((x / 16) | 0) % 2 === ((y / 16) | 0) % 2) px(c, x, y, 16, 16, C.floorB);
			}
		}
		for (let y = WALL_H; y < H; y += 16) px(c, 0, y, W, 1, C.floorLine);
		for (let x = 0; x < W; x += 16) px(c, x, WALL_H, 1, H - WALL_H, C.floorLine);

		const r = { x: 104, y: 170, w: 146, h: 42 };
		px(c, r.x, r.y, r.w, r.h, C.rug);
		px(c, r.x, r.y, r.w, 1, C.rugEdge);
		px(c, r.x, r.y + r.h - 1, r.w, 1, C.rugEdge);
		px(c, r.x, r.y, 1, r.h, C.rugEdge);
		px(c, r.x + r.w - 1, r.y, 1, r.h, C.rugEdge);
	}

	function drawWall(c, t) {
		px(c, 0, 0, W, WALL_H, C.wall);
		px(c, 0, 0, W, 6, C.wallTop);
		px(c, 0, WALL_H - 3, W, 3, C.wallTrim);

		px(c, DOOR.x, DOOR.y, DOOR.w, DOOR.h, C.door);
		px(c, DOOR.x, DOOR.y, DOOR.w, 2, C.doorDark);
		px(c, DOOR.x + DOOR.w - 3, DOOR.y, 3, DOOR.h, C.doorDark);
		px(c, DOOR.x + 4, DOOR.y + 4, DOOR.w - 11, DOOR.h - 8, "#7d5738");
		px(c, DOOR.x + DOOR.w - 9, DOOR.y + 16, 2, 3, C.paper);

		for (const w of WINDOWS) {
			px(c, w.x - 2, w.y - 2, w.w + 4, w.h + 4, C.wallTrim);
			px(c, w.x, w.y, w.w, w.h, C.glass);
			px(c, w.x, w.y, w.w, 8, C.glassLite);
			px(c, w.x + (w.w >> 1), w.y, 1, w.h, C.wallTrim);
			px(c, w.x, w.y + (w.h >> 1), w.w, 1, C.wallTrim);
			if (Math.sin(t / 900 + w.x) > 0.7) px(c, w.x + 6, w.y + 14, 2, 2, "#ffe9a8");
		}
	}

	function drawWhiteboard(c, hot, t) {
		const b = FURNITURE.whiteboard;
		px(c, b.x - 2, b.y - 2, b.w + 4, b.h + 4, C.boardFrame);
		px(c, b.x, b.y, b.w, b.h, C.board);
		px(c, b.x + 5, b.y + 4, 34, 1, "#5f6b7d");
		px(c, b.x + 5, b.y + 8, 46, 1, "#5f6b7d");
		px(c, b.x + 5, b.y + 12, 26, 1, "#7f8b9d");
		if (hot.has("whiteboard")) {
			const n = 4 + (((t / 140) | 0) % 24);
			px(c, b.x + 5, b.y + 16, n, 1, "#e2564a");
			px(c, b.x + 5, b.y + 20, Math.max(2, n - 9), 1, "#4a86e2");
		} else {
			px(c, b.x + 5, b.y + 16, 18, 1, "#a4aebd");
		}
	}

	function drawDesk(c, seat, hot) {
		const { deskX: x, deskY: y, deskW: w, deskH: h } = seat;
		px(c, x, y + h, w, 3, C.woodDark);
		px(c, x, y, w, h, C.deskTop);
		px(c, x, y, w, 2, C.deskLite);
		px(c, x + 2, y + h - 2, w - 4, 2, C.woodDark);

		const mx = seat.cx - 9;
		const my = y - 11;
		px(c, mx - 1, my - 1, 20, 13, C.metalDark);
		px(c, mx, my, 18, 11, C.screen);
		if (hot.has(`desk${seat.index}`)) {
			px(c, mx + 2, my + 2, 14, 1, "#4fd6a0");
			px(c, mx + 2, my + 4, 10, 1, "#8fb8ff");
			px(c, mx + 2, my + 6, 12, 1, "#8fb8ff");
			px(c, mx + 2, my + 8, 6, 1, "#ffcc4d");
		} else {
			px(c, mx + 2, my + 3, 8, 1, "#2c3a4c");
			px(c, mx + 2, my + 6, 11, 1, "#2c3a4c");
		}
		px(c, seat.cx - 2, my + 12, 4, 2, C.metalDark);
		px(c, seat.cx + 12, y + 4, 7, 5, C.paper);
		px(c, seat.cx + 12, y + 4, 7, 1, "#c9c2ad");
	}

	function drawChair(c, seat, occupied) {
		const x = seat.cx - 7;
		const y = seat.deskY + 21;
		px(c, x, y, 14, 9, occupied ? C.chairDark : C.chair);
		px(c, x, y + 9, 14, 2, C.chairDark);
		px(c, x + 5, y + 11, 4, 3, C.metalDark);
	}

	function drawArchive(c, hot, t) {
		const a = FURNITURE.archive;
		px(c, a.x, a.y, a.w, a.h, C.metal);
		px(c, a.x, a.y, a.w, 2, "#697485");
		const open = hot.has("archive") ? ((t / 260) | 0) % 3 : -1;
		for (let i = 0; i < 3; i++) {
			const dy = a.y + 4 + i * 9;
			px(c, a.x + 3, dy, a.w - 6, 7, C.metalDark);
			px(c, a.x + 3, dy, a.w - 6, 1, "#727d8e");
			px(c, a.x + (a.w >> 1) - 5, dy + 3, 10, 1, "#8b95a5");
			if (i === open) {
				px(c, a.x + 3, dy, a.w - 6, 7, "#2a323c");
				px(c, a.x + 5, dy + 1, a.w - 10, 5, C.paper);
			}
		}
	}

	function drawServerRack(c, hot, t) {
		const s = FURNITURE.server;
		px(c, s.x, s.y, s.w, s.h, C.rack);
		px(c, s.x, s.y, s.w, 2, "#3a4557");
		const fast = hot.has("server");
		for (let i = 0; i < 3; i++) {
			const dy = s.y + 5 + i * 9;
			px(c, s.x + 3, dy, s.w - 6, 7, "#1a212c");
			px(c, s.x + 5, dy + 3, s.w - 24, 1, "#2f3a49");
			const on = Math.sin((fast ? t / 90 : t / 520) + i * 1.7) > 0;
			px(c, s.x + s.w - 12, dy + 2, 2, 2, on ? "#6ee7a8" : "#24513c");
			px(c, s.x + s.w - 8, dy + 2, 2, 2, on ? "#24513c" : "#6ee7a8");
		}
	}

	function drawCoffee(c, hot, t) {
		const m = FURNITURE.coffee;
		px(c, m.x, m.y, m.w, m.h, C.metalDark);
		px(c, m.x, m.y, m.w, 2, C.metal);
		px(c, m.x + 4, m.y + 5, m.w - 8, 8, "#1c2330");
		px(c, m.x + 6, m.y + 7, 6, 4, hot.has("coffee") ? "#c98a4b" : "#2a3340");
		px(c, m.x + 5, m.y + m.h - 5, m.w - 10, 3, C.metal);
		if (hot.has("coffee") && ((t / 240) | 0) % 2) px(c, m.x + 9, m.y - 3, 2, 3, "#8fa3b8");
	}

	function drawPhoneTable(c, hot, t) {
		const p = FURNITURE.phone;
		px(c, p.x, p.y, p.w, p.h, C.wood);
		px(c, p.x, p.y, p.w, 2, "#96704a");
		px(c, p.x + 8, p.y - 7, 16, 8, "#1f2735");
		px(c, p.x + 10, p.y - 5, 12, 3, hot.has("phone") ? "#6ee7a8" : "#39455c");
		if (hot.has("phone") && ((t / 200) | 0) % 2) {
			px(c, p.x + 4, p.y - 11, 2, 2, "#ffcc4d");
			px(c, p.x + 26, p.y - 11, 2, 2, "#ffcc4d");
		}
	}

	function drawMeetingTable(c) {
		const m = FURNITURE.meeting;
		px(c, m.x, m.y + m.h, m.w, 3, C.woodDark);
		px(c, m.x, m.y, m.w, m.h, C.deskTop);
		px(c, m.x, m.y, m.w, 2, C.deskLite);
		px(c, m.x + 8, m.y + 8, 12, 8, C.paper);
		px(c, m.x + m.w - 24, m.y + 6, 10, 10, "#cfd6e2");
		px(c, m.x + (m.w >> 1) - 4, m.y + 9, 8, 6, "#4a5668");
	}

	function drawPlant(c, p) {
		px(c, p.x - 4, p.y, 8, 7, C.pot);
		px(c, p.x - 4, p.y, 8, 2, "#a06c48");
		px(c, p.x - 1, p.y - 5, 2, 5, C.plantDark);
		px(c, p.x - 6, p.y - 11, 12, 7, C.plant);
		px(c, p.x - 4, p.y - 14, 8, 4, C.plant);
		px(c, p.x - 6, p.y - 11, 5, 3, C.plantDark);
	}

	function drawRoom(c, t, hot, occupiedSeats) {
		drawFloor(c);
		drawWall(c, t);
		drawWhiteboard(c, hot, t);
		drawPhoneTable(c, hot, t);
		drawArchive(c, hot, t);
		drawServerRack(c, hot, t);
		drawCoffee(c, hot, t);
		drawMeetingTable(c);
		for (const p of PLANTS) drawPlant(c, p);
		for (const seat of SEATS) {
			drawDesk(c, seat, hot);
			drawChair(c, seat, occupiedSeats.has(seat.index));
		}
	}

	function seatAnchor(i) {
		return SEATS[(i ?? 0) % SEATS.length].anchor;
	}

	/** Where a character stands to perform a given office action. */
	function anchorFor(action, seatIndex) {
		switch (action) {
			case "archive":
			case "server":
			case "whiteboard":
			case "phone":
			case "coffee":
				return TARGETS[action];
			default:
				return seatAnchor(seatIndex);
		}
	}

	/**
	 * Axis-aligned waypoints from a position on `fromLane` to a target anchor.
	 * Route: onto own lane, across a vertical connector, along the target lane,
	 * then into the anchor.
	 */
	function path(from, target) {
		const fromLane = from.lane ?? 1;
		const toLane = target.lane ?? 1;
		const pts = [];
		const laneY = LANES[fromLane];

		if (Math.abs(from.y - laneY) > 0.5) pts.push({ x: from.x, y: laneY });

		if (fromLane !== toLane) {
			const vx = VCONN.reduce((best, x) =>
				Math.abs(x - from.x) + Math.abs(x - target.x) <
				Math.abs(best - from.x) + Math.abs(best - target.x)
					? x
					: best,
			);
			pts.push({ x: vx, y: laneY });
			pts.push({ x: vx, y: LANES[toLane] });
		}

		pts.push({ x: target.x, y: LANES[toLane] });
		pts.push({ x: target.x, y: target.y });
		return pts;
	}

	/** Station id used to highlight furniture while an action runs. */
	function stationKey(action, seatIndex) {
		if (!action || action === "type" || action === "delegate") return `desk${seatIndex ?? 0}`;
		return action;
	}

	window.Office = {
		W,
		H,
		WALL_H,
		LANES,
		SEATS,
		TARGETS,
		FURNITURE,
		colors: C,
		px,
		drawRoom,
		anchorFor,
		seatAnchor,
		path,
		stationKey,
	};
})();
