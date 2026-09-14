/**
 * Procedural pixel characters and effect particles.
 * No image assets: every character is a handful of fillRect calls so the look
 * stays consistent while the role/agent set is still changing.
 */
(() => {
	const px = (c, x, y, w, h, col) => {
		c.fillStyle = col;
		c.fillRect(x | 0, y | 0, w | 0, h | 0);
	};

	/**
	 * Job titles and outfits. Covers pi's subagent names plus the ChatDev-style
	 * company roles, so a crew from either world shows up correctly dressed.
	 */
	const ROLES = {
		scout: { title: "侦察员", shirt: "#4f9d69", trim: "#37714b" },
		planner: { title: "规划师", shirt: "#4a78c8", trim: "#33569a" },
		reviewer: { title: "评审员", shirt: "#b8574f", trim: "#8d3f38" },
		worker: { title: "工程师", shirt: "#c8913f", trim: "#9a6c28" },
		tester: { title: "测试员", shirt: "#7b57b8", trim: "#5b3d8d" },
		writer: { title: "文案", shirt: "#c85f9b", trim: "#9a4577" },
		ceo: { title: "CEO", shirt: "#d8d2c4", trim: "#a8a294" },
		cto: { title: "CTO", shirt: "#5f7fa8", trim: "#455f80" },
		cpo: { title: "CPO", shirt: "#a87fc8", trim: "#7f5c9a" },
		programmer: { title: "程序员", shirt: "#c8913f", trim: "#9a6c28" },
		designer: { title: "设计师", shirt: "#4fb8b0", trim: "#379088" },
		counselor: { title: "顾问", shirt: "#8f8f9f", trim: "#6b6b7a" },
		hr: { title: "HR", shirt: "#c8a04f", trim: "#9a7a33" },
	};

	const SKINS = ["#f0cba3", "#e8b98f", "#d69f70", "#b87a4f"];
	const HAIRS = ["#2f2418", "#1f2430", "#4a2f22", "#3b3b45", "#5c3b1e"];
	const FALLBACK_SHIRTS = ["#4a78c8", "#4f9d69", "#c8913f", "#b8574f", "#7b57b8", "#4fb8b0"];

	function hash(text) {
		let h = 2166136261;
		for (let i = 0; i < text.length; i++) {
			h ^= text.charCodeAt(i);
			h = (h * 16777619) >>> 0;
		}
		return h;
	}

	function roleFor(name) {
		return ROLES[String(name ?? "").toLowerCase()] ?? null;
	}

	/** Stable per-agent look, keyed by id so a character never changes clothes. */
	function paletteFor(id, name, isLead) {
		const h = hash(`${id}|${name}`);
		const role = roleFor(name);
		return {
			skin: SKINS[h % SKINS.length],
			hair: HAIRS[(h >>> 3) % HAIRS.length],
			shirt: role ? role.shirt : FALLBACK_SHIRTS[(h >>> 6) % FALLBACK_SHIRTS.length],
			trim: role ? role.trim : "#2b3242",
			badge: isLead ? "#ffcc4d" : "#8fb8ff",
		};
	}

	const PIPS = {
		thinking: "#8fb8ff",
		working: "#ffcc4d",
		waiting: "#c79bff",
		talking: "#6ee7a8",
		done: "#6ee7a8",
		error: "#ff8f6b",
		idle: null,
	};

	/**
	 * @param a {x,y} is the ground point (between the feet).
	 */
	function drawCharacter(c, a, t) {
		const p = a.palette;
		const walking = a.pose === "walk";
		const sitting = a.pose === "sit" || a.pose === "type";
		const step = walking ? (((a.walkPhase / 0.16) | 0) % 2) : 0;
		const bob = walking ? (step ? 1 : 0) : Math.sin(t / 620 + a.seed) > 0.6 ? 1 : 0;

		const y = (a.y | 0) - (sitting ? 3 : 0) + (sitting ? 0 : bob);
		const x = a.x | 0;
		const dir = a.dir ?? "down";

		px(c, x - 5, y - 1, 10, 2, "rgba(0,0,0,0.28)");

		if (!sitting) {
			const l1 = step ? 1 : 0;
			const l2 = step ? 0 : 1;
			px(c, x - 3, y - 5 + l1, 2, 5 - l1, "#2b3242");
			px(c, x + 1, y - 5 + l2, 2, 5 - l2, "#2b3242");
			px(c, x - 3, y - 1, 2, 1, "#1b202b");
			px(c, x + 1, y - 1, 2, 1, "#1b202b");
		}

		px(c, x - 4, y - 12, 8, 8, p.shirt);
		px(c, x - 4, y - 12, 8, 1, p.trim);
		px(c, x - 4, y - 6, 8, 2, p.trim);

		const armUp = a.pose === "type" ? (((t / 90) | 0) % 2) : a.pose === "reach" ? 1 : 0;
		if (dir === "left") {
			px(c, x - 6, y - 11 - armUp, 2, 5, p.shirt);
		} else if (dir === "right") {
			px(c, x + 4, y - 11 - armUp, 2, 5, p.shirt);
		} else {
			px(c, x - 6, y - 11 - armUp, 2, 5, p.shirt);
			px(c, x + 4, y - 11 - (a.pose === "type" ? 1 - armUp : armUp), 2, 5, p.shirt);
		}

		px(c, x - 3, y - 19, 6, 7, p.skin);
		px(c, x - 4, y - 20, 8, 4, p.hair);
		px(c, x - 4, y - 17, 1, 2, p.hair);
		px(c, x + 3, y - 17, 1, 2, p.hair);

		if (dir === "down") {
			px(c, x - 2, y - 16, 1, 2, "#232a36");
			px(c, x + 1, y - 16, 1, 2, "#232a36");
			if (a.pose === "talk") px(c, x - 1, y - 13, 2, 1, "#8d4a44");
		} else if (dir === "left") {
			px(c, x - 2, y - 16, 1, 2, "#232a36");
			px(c, x - 4, y - 20, 5, 5, p.hair);
			px(c, x - 3, y - 19, 2, 1, p.skin);
		} else if (dir === "right") {
			px(c, x + 1, y - 16, 1, 2, "#232a36");
			px(c, x - 1, y - 20, 5, 5, p.hair);
			px(c, x + 1, y - 19, 2, 1, p.skin);
		} else {
			px(c, x - 4, y - 20, 8, 6, p.hair);
		}

		px(c, x - 1, y - 11, 2, 2, p.badge);

		const pip = PIPS[a.state ?? "idle"];
		if (pip) {
			const pulse = a.state === "thinking" ? (Math.sin(t / 240) > -0.2 ? 0 : 1) : 0;
			if (!pulse) {
				px(c, x - 1, y - 25, 3, 3, pip);
				px(c, x, y - 26, 1, 1, pip);
			}
		}
	}

	function drawParticle(c, p) {
		const a = Math.max(0, Math.min(1, p.life / p.maxLife));
		c.globalAlpha = a;
		const x = p.x | 0;
		const y = p.y | 0;
		switch (p.kind) {
			case "key":
				px(c, x, y, 3, 3, "#8fb8ff");
				px(c, x + 1, y + 1, 1, 1, "#0f1620");
				break;
			case "paper":
				px(c, x - 3, y - 2, 7, 5, "#e8e2d0");
				px(c, x - 2, y - 1, 5, 1, "#b9b3a1");
				px(c, x - 2, y + 1, 3, 1, "#b9b3a1");
				break;
			case "check":
				px(c, x - 3, y, 2, 2, "#6ee7a8");
				px(c, x - 1, y + 2, 2, 2, "#6ee7a8");
				px(c, x + 1, y, 2, 2, "#6ee7a8");
				px(c, x + 3, y - 2, 2, 2, "#6ee7a8");
				break;
			case "bang":
				px(c, x, y - 5, 2, 4, "#ffcc4d");
				px(c, x, y, 2, 2, "#ffcc4d");
				break;
			case "cross":
				px(c, x - 2, y - 2, 2, 2, "#ff8f6b");
				px(c, x + 1, y + 1, 2, 2, "#ff8f6b");
				px(c, x + 1, y - 2, 2, 2, "#ff8f6b");
				px(c, x - 2, y + 1, 2, 2, "#ff8f6b");
				break;
			case "spark":
				px(c, x, y, 2, 2, p.color ?? "#6ee7a8");
				break;
			default:
				px(c, x, y, 2, 2, "#d7dee9");
		}
		c.globalAlpha = 1;
	}

	window.Sprites = { ROLES, roleFor, paletteFor, drawCharacter, drawParticle, hash };
})();
