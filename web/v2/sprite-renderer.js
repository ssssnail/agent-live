/** Build the V2 character renderer from Agent Skin and Style content. */
export function createSpriteRenderer(content) {
	const skin = content.agentSkin;
	const base = content.style.tokens.character;
	const override = content.atmosphere.styleOverrides?.character ?? {};
	const V = {
		...base,
		...override,
		pips: { ...base.pips, ...(override.pips ?? {}) },
		particles: { ...base.particles, ...(override.particles ?? {}) },
	};
	const px = (c, x, y, w, h, color) => {
		c.fillStyle = color;
		c.fillRect(x | 0, y | 0, w | 0, h | 0);
	};

	function hash(text) {
		let value = 2166136261;
		for (let i = 0; i < text.length; i++) {
			value ^= text.charCodeAt(i);
			value = (value * 16777619) >>> 0;
		}
		return value;
	}

	function roleFor(name) {
		return skin.roles[String(name ?? "").toLowerCase()] ?? null;
	}

	function paletteFor(id, name, isLead) {
		const value = hash(`${id}|${name}`);
		const role = roleFor(name);
		return {
			skin: skin.palettes.skin[value % skin.palettes.skin.length],
			hair: skin.palettes.hair[(value >> 3) % skin.palettes.hair.length],
			shirt: role ? role.shirt : skin.palettes.fallbackShirts[(value >> 6) % skin.palettes.fallbackShirts.length],
			trim: role ? role.trim : skin.palettes.defaultTrim,
			badge: isLead ? skin.palettes.leadBadge : skin.palettes.agentBadge,
		};
	}

	function drawCharacter(c, actor, t) {
		const p = actor.palette;
		const walking = actor.pose === "walk";
		const sitting = actor.pose === "sit" || actor.pose === "type";
		const step = walking ? (((actor.walkPhase / 0.16) | 0) % 2) : 0;
		const bob = walking ? (step ? 1 : 0) : Math.sin(t / 620 + actor.seed) > 0.6 ? 1 : 0;
		const y = (actor.y | 0) - (sitting ? 3 : 0) + (sitting ? 0 : bob);
		const x = actor.x | 0;
		const dir = actor.dir ?? "down";

		px(c, x - 5, y - 1, 10, 2, V.shadow);
		if (!sitting) {
			const leftStep = step ? 1 : 0;
			const rightStep = step ? 0 : 1;
			px(c, x - 3, y - 5 + leftStep, 2, 5 - leftStep, V.pants);
			px(c, x + 1, y - 5 + rightStep, 2, 5 - rightStep, V.pants);
			px(c, x - 3, y - 1, 2, 1, V.shoes);
			px(c, x + 1, y - 1, 2, 1, V.shoes);
		}

		px(c, x - 4, y - 12, 8, 8, p.shirt);
		px(c, x - 4, y - 12, 8, 1, p.trim);
		px(c, x - 4, y - 6, 8, 2, p.trim);
		const armUp = actor.pose === "type" ? (((t / 90) | 0) % 2) : actor.pose === "reach" ? 1 : 0;
		if (dir === "left") {
			px(c, x - 6, y - 11 - armUp, 2, 5, p.shirt);
		} else if (dir === "right") {
			px(c, x + 4, y - 11 - armUp, 2, 5, p.shirt);
		} else {
			px(c, x - 6, y - 11 - armUp, 2, 5, p.shirt);
			px(c, x + 4, y - 11 - (actor.pose === "type" ? 1 - armUp : armUp), 2, 5, p.shirt);
		}

		px(c, x - 3, y - 19, 6, 7, p.skin);
		px(c, x - 4, y - 20, 8, 4, p.hair);
		px(c, x - 4, y - 17, 1, 2, p.hair);
		px(c, x + 3, y - 17, 1, 2, p.hair);
		if (dir === "down") {
			px(c, x - 2, y - 16, 1, 2, V.faceInk);
			px(c, x + 1, y - 16, 1, 2, V.faceInk);
			if (actor.pose === "talk") px(c, x - 1, y - 13, 2, 1, V.mouth);
		} else if (dir === "left") {
			px(c, x - 2, y - 16, 1, 2, V.faceInk);
			px(c, x - 4, y - 20, 5, 5, p.hair);
			px(c, x - 3, y - 19, 2, 1, p.skin);
		} else if (dir === "right") {
			px(c, x + 1, y - 16, 1, 2, V.faceInk);
			px(c, x - 1, y - 20, 5, 5, p.hair);
			px(c, x + 1, y - 19, 2, 1, p.skin);
		} else {
			px(c, x - 4, y - 20, 8, 6, p.hair);
		}
		px(c, x - 1, y - 11, 2, 2, p.badge);

		const pip = V.pips[actor.state ?? "idle"];
		if (pip) {
			const hidden = actor.state === "thinking" && Math.sin(t / 240) <= -0.2;
			if (!hidden) {
				px(c, x - 1, y - 25, 3, 3, pip);
				px(c, x, y - 26, 1, 1, pip);
			}
		}
	}

	function drawParticle(c, particle) {
		const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
		c.globalAlpha = alpha;
		const x = particle.x | 0;
		const y = particle.y | 0;
		switch (particle.kind) {
			case "key":
				px(c, x, y, 3, 3, V.particles.key);
				px(c, x + 1, y + 1, 1, 1, V.particles.keyInset);
				break;
			case "paper":
				px(c, x - 3, y - 2, 7, 5, V.particles.paper);
				px(c, x - 2, y - 1, 5, 1, V.particles.paperLine);
				px(c, x - 2, y + 1, 3, 1, V.particles.paperLine);
				break;
			case "check":
				px(c, x - 3, y, 2, 2, V.particles.check);
				px(c, x - 1, y + 2, 2, 2, V.particles.check);
				px(c, x + 1, y, 2, 2, V.particles.check);
				px(c, x + 3, y - 2, 2, 2, V.particles.check);
				break;
			case "bang":
				px(c, x, y - 5, 2, 4, V.particles.bang);
				px(c, x, y, 2, 2, V.particles.bang);
				break;
			case "cross":
				px(c, x - 2, y - 2, 2, 2, V.particles.cross);
				px(c, x + 1, y + 1, 2, 2, V.particles.cross);
				px(c, x + 1, y - 2, 2, 2, V.particles.cross);
				px(c, x - 2, y + 1, 2, 2, V.particles.cross);
				break;
			case "spark":
				px(c, x, y, 2, 2, particle.color ?? V.particles.spark);
				break;
			default:
				px(c, x, y, 2, 2, V.particles.fallback);
		}
		c.globalAlpha = 1;
	}

	return Object.freeze({
		ROLES: skin.roles,
		roleFor,
		paletteFor,
		drawCharacter,
		drawParticle,
		hash,
		content: skin,
	});
}
