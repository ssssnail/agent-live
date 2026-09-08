/**
 * Agent Live renderer.
 *
 * Consumes the office event stream (SSE) and drives one pixel character per
 * agent: where it walks, what it does, and what it is thinking out loud.
 */
(() => {
	const { Office, Sprites } = window;
	const I18n = window.AgentLiveI18n ?? { t: (key) => key, text: (value) => value };
	const t = (key, vars) => I18n.t(key, vars);
	const tx = (value) => I18n.text(value);
	const isCodexClient = new URLSearchParams(location.search).get("client") === "codex";
	const officeContent = window.OfficeContent ?? null;
	const lifeActivities = officeContent?.lifeActivities?.entries ?? [];
	const npcEntries = officeContent?.npcs?.entries ?? [];
	const canvas = document.getElementById("stage");
	const ctx = canvas.getContext("2d", { alpha: false });

	const SPEED = 44; // logical px per second
	const REPLAY_RATE = 3;
	const BUBBLE_MS = { think: 4200, say: 6000, do: 2800, life: 3200 };

	let dpr = 1;
	let scale = 3;
	let offX = 0;
	let offY = 0;

	function resize() {
		const rect = canvas.parentElement.getBoundingClientRect();
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		const dw = Math.max(1, Math.floor(rect.width * dpr));
		const dh = Math.max(1, Math.floor(rect.height * dpr));
		canvas.width = dw;
		canvas.height = dh;
		scale = Math.max(1, Math.floor(Math.min(dw / Office.W, dh / Office.H)));
		offX = Math.floor((dw - Office.W * scale) / 2);
		offY = Math.floor((dh - Office.H * scale) / 2);
	}
	window.addEventListener("resize", resize);

	const toScreen = (wx, wy) => ({ x: offX + wx * scale, y: offY + wy * scale });

	// ---------------------------------------------------------------- state

	/** @type {Map<string, any>} */
	const actors = new Map();
	const particles = [];
	const hot = new Set();
	const lifeHot = new Set();
	let session = { model: "—", turns: 0, busy: false, cwd: "" };
	let meeting = null;
	const meetQueue = [];
	let sound = false;
	let nextNpcShiftCheck = 0;
	let eventHistory = [];
	let replay = null;
	const replayButton = document.getElementById("replay");
	const replayStatus = document.getElementById("replayStatus");
	const isReplayable = (entry) => ["task", "thought", "say", "action", "delegate"].includes(entry?.event?.type);

	function makeActor(view) {
		const isLead = !view.parent;
		const seat = view.seat ?? 0;
		const spawn = isLead ? Office.seatAnchor(seat) : Office.TARGETS.entry;
		return {
			id: view.id,
			name: tx(view.name),
			role: tx(view.role),
			title: tx(view.role),
			model: view.model,
			isLead,
			isNpc: false,
			seat,
			palette: Sprites.paletteFor(view.id, view.name, isLead),
			seed: (Sprites.hash(view.id) % 100) / 10,
			x: spawn.x,
			y: spawn.y,
			lane: spawn.lane,
			zone: spawn.zone,
			dir: spawn.dir,
			pose: isLead ? "sit" : "stand",
			walkPhase: 0,
			path: [],
			dest: spawn,
			state: view.state ?? "idle",
			detail: tx(view.detail ?? ""),
			task: view.task ?? "",
			action: view.action ?? null,
			tokens: view.tokens ?? 0,
			cost: view.cost ?? 0,
			bubble: null,
			inMeeting: false,
			leaving: false,
			life: null,
			lifeCycle: 0,
			nextLifeAt: 0,
			spawnAt: performance.now(),
		};
	}

	function goTo(actor, target) {
		if (!target) return;
		actor.dest = target;
		actor.path = Office.path(actor, target);
	}

	/** Pick where a character should be, given what it is currently doing. */
	function retarget(actor) {
		if (actor.inMeeting || actor.leaving) return;
		goTo(actor, Office.anchorFor(actor.action, actor.seat));
	}

	function restPose(actor) {
		if (actor.life && !actor.path.length) return actor.life.step?.pose ?? "stand";
		if (actor.isNpc) return actor.idlePose ?? "stand";
		const a = actor.action;
		if (a === "archive" || a === "server") return "reach";
		if (a === "whiteboard") return "reach";
		if (a === "phone") return "talk";
		if (a === "coffee") return "stand";
		if (actor.inMeeting) return "talk";
		if (actor.state === "working" && (!a || a === "type")) return "type";
		if (!a || a === "type" || a === "delegate") return "sit";
		return "stand";
	}

	function bubble(actor, kind, text) {
		if (!text) return;
		actor.bubble = {
			kind,
			text: String(text),
			shown: 0,
			remainingMs: BUBBLE_MS[kind] ?? 3000,
		};
	}

	function spawn(kind, x, y, opts = {}) {
		particles.push({
			kind,
			x,
			y,
			vx: opts.vx ?? 0,
			vy: opts.vy ?? -14,
			life: opts.life ?? 1,
			maxLife: opts.life ?? 1,
			target: opts.target ?? null,
			t: 0,
			color: opts.color,
		});
	}

	// ----------------------------------------------------------- office life

	function rangedDelay(range, seed) {
		if (typeof range === "number") return Math.max(0, range);
		const min = Math.max(0, Number(range?.[0] ?? 0));
		const max = Math.max(min, Number(range?.[1] ?? min));
		if (max === min) return min;
		return min + (Sprites.hash(seed) % (max - min + 1));
	}

	function matchesParticipant(actor, participant) {
		if ((participant.kind === "npc") !== actor.isNpc) return false;
		if (participant.roles?.length && !participant.roles.includes(actor.role)) return false;
		if (participant.states?.length && !participant.states.includes(actor.state)) return false;
		return true;
	}

	function activitiesFor(actor) {
		return lifeActivities.filter((activity) => {
			const participant = activity.participant ?? {};
			if (!matchesParticipant(actor, participant)) return false;
			if (activity.onlyWhenSessionIdle && session.busy) return false;
			if (Number(participant.minAgents ?? 1) > 1) {
				const available = [...actors.values()].filter((candidate) =>
					!candidate.isNpc && !candidate.leaving && matchesParticipant(candidate, participant),
				);
				if (available.length < Number(participant.minAgents)) return false;
			}
			return true;
		});
	}

	function scheduleLife(actor, activity, now, initial = false) {
		actor.lifeCycle += 1;
		const range = initial ? activity.initialDelayMs : activity.cooldownMs;
		actor.nextLifeAt = now + rangedDelay(range, `${actor.id}:${activity.id}:${actor.lifeCycle}`);
	}

	function clearLifeStep(actor) {
		const hotKey = actor.life?.step?.hot;
		if (hotKey) lifeHot.delete(hotKey);
	}

	function cancelLife(actor, now = performance.now()) {
		if (!actor?.life) return;
		clearLifeStep(actor);
		const activity = actor.life.activity;
		actor.life = null;
		if (actor.bubble?.kind === "life") actor.bubble = null;
		scheduleLife(actor, activity, now);
	}

	function beginLifeStep(actor, activity, index, now, slot = actor.life?.slot ?? 0) {
		const configuredStep = activity.steps[index];
		if (!configuredStep) {
			actor.life = null;
			scheduleLife(actor, activity, now);
			if (!actor.isNpc) retarget(actor);
			return;
		}
		const targetName = configuredStep.targets?.[slot % configuredStep.targets.length] ?? configuredStep.target;
		const step = {
			...configuredStep,
			target: targetName,
			bubble: configuredStep.bubbles?.[slot % configuredStep.bubbles.length] ?? configuredStep.bubble,
		};
		const target = Office.TARGETS[step.target];
		actor._lifeAcc = 0;
		actor.life = { activity, index, step, slot, phase: "walk", until: 0 };
		goTo(actor, target);
		if (index === 0 && activity.startBubble) bubble(actor, "life", tx(activity.startBubble));
	}

	function startLife(actor, activity, now) {
		const participant = activity.participant ?? {};
		const minAgents = Math.max(1, Number(participant.minAgents ?? 1));
		if (minAgents === 1) {
			beginLifeStep(actor, activity, 0, now);
			return;
		}
		const partners = [...actors.values()].filter((candidate) =>
			candidate.id !== actor.id &&
			!candidate.isNpc &&
			!candidate.life &&
			!candidate.path.length &&
			!candidate.action &&
			!candidate.inMeeting &&
			!candidate.leaving &&
			matchesParticipant(candidate, participant),
		);
		const group = [actor, ...partners.slice(0, minAgents - 1)];
		if (group.length < minAgents) {
			scheduleLife(actor, activity, now);
			return;
		}
		for (let slot = 0; slot < group.length; slot++) beginLifeStep(group[slot], activity, 0, now, slot);
	}

	function updateActorLife(actor, now, dt) {
		if (!actor.life) {
			if (actor.path.length || actor.inMeeting || actor.leaving || actor.action) return;
			const choices = activitiesFor(actor);
			if (!choices.length) {
				actor.nextLifeAt = 0;
				return;
			}
			const activity = choices[(Sprites.hash(`${actor.id}:${actor.lifeCycle}`) >>> 4) % choices.length];
			if (!actor.nextLifeAt) scheduleLife(actor, activity, now, true);
			if (now >= actor.nextLifeAt) startLife(actor, activity, now);
			return;
		}

		const life = actor.life;
		if (life.phase === "walk" && !actor.path.length) {
			life.phase = "dwell";
			life.remainingMs = Number(life.step.durationMs ?? 1500);
			if (life.step.hot) lifeHot.add(life.step.hot);
			if (life.step.bubble) bubble(actor, "life", tx(life.step.bubble));
			actor.pose = life.step.pose ?? "stand";
		}
		if (life.phase !== "dwell") return;

		actor._lifeAcc = (actor._lifeAcc ?? 0) + dt;
		if (life.step.particle && actor._lifeAcc >= 0.42) {
			actor._lifeAcc = 0;
			spawn(life.step.particle, actor.x + (Math.random() - 0.5) * 8, actor.y - 14, {
				life: 0.55,
				vy: -10,
				color: Office.colors.waterActive,
			});
		}
		life.remainingMs -= dt * 1000;
		if (life.remainingMs > 0) return;
		clearLifeStep(actor);
		beginLifeStep(actor, life.activity, life.index + 1, now, life.slot);
	}

	function makeNpc(entry, fromEntry = false) {
		const workPoint = Office.TARGETS[entry.spawn] ?? Office.TARGETS.entry;
		const spawnPoint = fromEntry ? Office.TARGETS.entry : workPoint;
		return {
			id: `npc:${entry.id}`,
			name: tx(entry.name),
			role: entry.role,
			title: tx(entry.title ?? entry.role),
			isLead: false,
			isNpc: true,
			seat: -1,
			palette: { ...Sprites.paletteFor(entry.id, entry.role, false), ...(entry.appearance ?? {}) },
			seed: (Sprites.hash(entry.id) % 100) / 10,
			x: spawnPoint.x,
			y: spawnPoint.y,
			lane: spawnPoint.lane,
			zone: spawnPoint.zone,
			dir: spawnPoint.dir,
			pose: entry.pose ?? "stand",
			idlePose: entry.pose ?? "stand",
			workTarget: entry.spawn,
			shift: entry.shift,
			walkPhase: 0,
			path: [],
			dest: spawnPoint,
			state: "idle",
			detail: "",
			task: "",
			action: null,
			tokens: 0,
			cost: 0,
			bubble: null,
			inMeeting: false,
			leaving: false,
			life: null,
			lifeCycle: 0,
			nextLifeAt: 0,
			spawnAt: performance.now(),
		};
	}

	function restoreNpcs(fromEntry = false) {
		for (const entry of npcEntries) {
			if (!isNpcOnDuty(entry)) continue;
			const npc = makeNpc(entry, fromEntry);
			actors.set(npc.id, npc);
			if (fromEntry) {
				bubble(npc, "life", tx(Office.npcShiftLabel?.("arrival") ?? t("npc.arrival")));
				goTo(npc, Office.TARGETS[entry.spawn] ?? Office.TARGETS.entry);
			}
		}
	}

	function isNpcOnDuty(entry) {
		return Office.isNpcOnDuty?.(entry.role, entry.shift) ?? true;
	}

	function sendNpcHome(actor) {
		if (!actor?.isNpc || actor.leaving) return;
		cancelLife(actor);
		actor.leaving = true;
		actor.pose = "stand";
		actor.nextLifeAt = 0;
		bubble(actor, "life", tx(Office.npcShiftLabel?.("departure") ?? t("npc.departure")));
		goTo(actor, Office.TARGETS.entry);
	}

	function bringNpcToWork(entry) {
		const id = `npc:${entry.id}`;
		if (actors.has(id)) return;
		const npc = makeNpc(entry, true);
		actors.set(id, npc);
		bubble(npc, "life", tx(Office.npcShiftLabel?.("arrival") ?? t("npc.arrival")));
		goTo(npc, Office.TARGETS[entry.spawn] ?? Office.TARGETS.entry);
	}

	function syncNpcShift(now) {
		if (now < nextNpcShiftCheck) return;
		nextNpcShiftCheck = now + 250;
		for (const entry of npcEntries) {
			const actor = actors.get(`npc:${entry.id}`);
			if (isNpcOnDuty(entry)) {
				if (!actor) bringNpcToWork(entry);
			} else if (actor) {
				sendNpcHome(actor);
			}
		}
	}

	// ---------------------------------------------------------------- events

	/**
	 * Append to the activity feed. The server broadcasts `log` only for
	 * join/leave/delegate; thought/say/tool arrive as their own events and are
	 * fed in here at full length, while the bubble shows a trimmed version.
	 */
	function feed(agentId, kind, text) {
		if (!text) return;
		logLine({ at: Date.now(), agentId, kind, text });
	}

	function apply(ev) {
		switch (ev.type) {
			case "snapshot": {
				eventHistory = Array.isArray(ev.history) ? ev.history.slice() : eventHistory;
				actors.clear();
				particles.length = 0;
				hot.clear();
				lifeHot.clear();
				nextNpcShiftCheck = 0;
				document.getElementById("log").innerHTML = "";
				for (const view of ev.agents) actors.set(view.id, makeActor(view));
				restoreNpcs();
				for (const item of ev.log) logLine(item);
				session = ev.session;
				if (ev.agents[0]?.task) setTask(ev.agents[0].task);
				renderCrew();
				break;
			}
			case "session":
				session = ev.session;
				if (session.busy) {
					for (const actor of actors.values()) if (!actor.isNpc) cancelLife(actor);
				}
				break;
			case "agent_join": {
				const existing = actors.get(ev.agent.id);
				if (existing) {
					existing.name = tx(ev.agent.name ?? existing.name);
					existing.role = tx(ev.agent.role ?? existing.role);
					existing.title = tx(ev.agent.role ?? existing.title);
					existing.model = ev.agent.model ?? existing.model;
					existing.task = ev.agent.task ?? existing.task;
					existing.detail = tx(ev.agent.detail ?? existing.detail);
					renderCrew();
				} else {
					const actor = makeActor(ev.agent);
					actors.set(ev.agent.id, actor);
					if (!actor.isLead) {
						bubble(actor, "say", t("agent.joined"));
						beep(660, 0.06);
					}
					retarget(actor);
					renderCrew();
				}
				break;
			}
			case "agent_leave": {
				const actor = actors.get(ev.id);
				if (!actor) break;
				cancelLife(actor);
				actor.leaving = true;
				actor.inMeeting = false;
				spawn(ev.ok ? "check" : "cross", actor.x, actor.y - 26, { life: 1.1 });
				goTo(actor, Office.TARGETS.entry);
				break;
			}
			case "agent_state": {
				const actor = actors.get(ev.id);
				if (!actor) break;
				if (ev.state !== "idle") cancelLife(actor);
				actor.state = ev.state;
				actor.detail = tx(ev.detail ?? "");
				if (ev.state === "done") spawn("check", actor.x, actor.y - 26, { life: 1.2 });
				if (ev.state === "error") spawn("cross", actor.x, actor.y - 26, { life: 1.2 });
				if (!actor.path.length) actor.pose = restPose(actor);
				renderCrew();
				break;
			}
			case "task": {
				const actor = actors.get(ev.id);
				if (actor) {
					cancelLife(actor);
					actor.task = ev.task;
				}
				if (actor?.isLead) setTask(ev.task);
				break;
			}
			case "thought": {
				const actor = actors.get(ev.id);
				if (!actor) break;
				cancelLife(actor);
				bubble(actor, "think", tail(ev.text, 52));
				feed(ev.id, "thought", ev.text);
				break;
			}
			case "say": {
				const actor = actors.get(ev.id);
				if (!actor) break;
				cancelLife(actor);
				bubble(actor, "say", head(ev.text, 90));
				feed(ev.id, "say", ev.text);
				break;
			}
			case "action": {
				const actor = actors.get(ev.id);
				if (!actor) break;
				cancelLife(actor);
				actor.action = ev.action;
				actor.state = "working";
				actor.detail = ev.label;
				hot.add(Office.stationKey(ev.action, actor.seat));
				bubble(actor, "do", tx(ev.label));
				feed(ev.id, "tool", tx(ev.label));
				retarget(actor);
				renderCrew();
				break;
			}
			case "action_end": {
				const actor = actors.get(ev.id);
				if (!actor) break;
				hot.delete(Office.stationKey(actor.action, actor.seat));
				actor.action = null;
				if (!ev.ok) spawn("cross", actor.x, actor.y - 26, { life: 1 });
				retarget(actor);
				break;
			}
			case "delegate": {
				cancelLife(actors.get(ev.from));
				cancelLife(actors.get(ev.to));
				if (Office.interactions?.handoff === "seated") {
					const from = actors.get(ev.from);
					const to = actors.get(ev.to);
					const director = [...actors.values()].find((actor) =>
						actor.isNpc && actor.role === Office.interactions.directorNpcRole,
					);
					if (director) bubble(director, "say", t("delegate.owner", { name: to?.name ?? "Teammate" }));
					if (from && to) {
						spawn("paper", from.x + 6, from.y - 14, {
							life: 0.9,
							target: { x: to.x - 6, y: to.y - 14 },
						});
						spawn("bang", to.x, to.y - 30, { life: 1.1, vy: -8 });
						bubble(to, "say", head(ev.task, 60));
					}
					beep(520, 0.07);
				} else {
					meetQueue.push({ from: ev.from, to: ev.to, task: ev.task });
				}
				break;
			}
			case "usage": {
				const actor = actors.get(ev.id);
				if (actor) {
					actor.tokens = ev.tokens;
					actor.cost = ev.cost;
				}
				renderCrew();
				break;
			}
			case "log":
				logLine(ev.item);
				break;
		}
		renderBar();
	}

	// ------------------------------------------------------- meeting (handoff)

	/**
	 * The ChatDev-style pair seminar: both agents walk to the meeting table,
	 * face each other, and the task is physically handed over.
	 */
	function updateMeeting(now, dt) {
		if (!meeting && meetQueue.length) {
			const next = meetQueue.shift();
			const from = actors.get(next.from);
			const to = actors.get(next.to);
			if (!from || !to) return;
			meeting = { ...next, phase: "walk", t: 0 };
			from.inMeeting = true;
			to.inMeeting = true;
			goTo(from, Office.TARGETS.meetA);
			goTo(to, Office.TARGETS.meetB);
			bubble(from, "do", t("delegate.assign", { task: head(next.task, 40) }));
		}
		if (!meeting) return;

		const from = actors.get(meeting.from);
		const to = actors.get(meeting.to);
		if (!from || !to) {
			endMeeting();
			return;
		}
		meeting.t += dt;

		if (meeting.phase === "walk") {
			const ready = !from.path.length && !to.path.length;
			if (ready || meeting.t > 5) {
				meeting.phase = "hand";
				meeting.t = 0;
				from.pose = "talk";
				to.pose = "talk";
				spawn("paper", from.x + 6, from.y - 14, {
					life: 0.9,
					target: { x: to.x - 6, y: to.y - 14 },
				});
				spawn("bang", to.x, to.y - 30, { life: 1.1, vy: -8 });
				bubble(to, "say", head(meeting.task, 60));
				beep(520, 0.07);
				setTimeout(() => beep(700, 0.07), 90);
			}
			return;
		}

		if (meeting.phase === "hand" && meeting.t > 1.5) endMeeting();
	}

	function endMeeting() {
		if (!meeting) return;
		for (const id of [meeting.from, meeting.to]) {
			const actor = actors.get(id);
			if (!actor) continue;
			actor.inMeeting = false;
			retarget(actor);
		}
		meeting = null;
	}

	// ---------------------------------------------------------------- update

	function update(dt, now) {
		if (replay) dt *= REPLAY_RATE;
		syncNpcShift(now);
		updateMeeting(now, dt);

		for (const actor of [...actors.values()]) {
			if (actor.path.length) {
				const next = actor.path[0];
				const dx = next.x - actor.x;
				const dy = next.y - actor.y;
				const dist = Math.abs(dx) + Math.abs(dy);
				const move = SPEED * dt;
				if (dist <= move) {
					actor.x = next.x;
					actor.y = next.y;
						actor.path.shift();
						if (next.zone) actor.zone = next.zone;
						if (!actor.path.length) {
							actor.dir = actor.dest.dir ?? actor.dir;
							actor.lane = actor.dest.lane ?? actor.lane;
							actor.zone = actor.dest.zone ?? actor.zone;
						actor.pose = restPose(actor);
						if (actor.leaving) {
							actors.delete(actor.id);
							renderCrew();
							continue;
						}
					}
				} else if (Math.abs(dx) > 0.01) {
					actor.x += Math.sign(dx) * move;
					actor.dir = dx > 0 ? "right" : "left";
					actor.pose = "walk";
				} else {
					actor.y += Math.sign(dy) * move;
					actor.dir = dy > 0 ? "down" : "up";
					actor.pose = "walk";
				}
				actor.walkPhase += dt;
			} else if (actor.pose !== restPose(actor)) {
				actor.pose = restPose(actor);
			}

			updateActorLife(actor, now, dt);

			if (actor.bubble) {
				actor.bubble.shown = Math.min(
					actor.bubble.text.length,
					actor.bubble.shown + dt * 46,
				);
				actor.bubble.remainingMs -= dt * 1000;
				if (actor.bubble.remainingMs <= 0) actor.bubble = null;
			}

			emitWorkParticles(actor, dt);
		}

		for (let i = particles.length - 1; i >= 0; i--) {
			const p = particles[i];
			p.t += dt;
			p.life -= dt;
			if (p.target) {
				const k = Math.min(1, p.t / p.maxLife);
				p.x += (p.target.x - p.x) * Math.min(1, k * 0.28);
				p.y += (p.target.y - p.y) * Math.min(1, k * 0.28) - dt * 6;
			} else {
				p.x += p.vx * dt;
				p.y += p.vy * dt;
			}
			if (p.life <= 0) particles.splice(i, 1);
		}
	}

	function emitWorkParticles(actor, dt) {
		if (actor.path.length || actor.state !== "working") return;
		actor._acc = (actor._acc ?? 0) + dt;
		const rate = actor.action === "server" ? 0.18 : 0.26;
		if (actor._acc < rate) return;
		actor._acc = 0;
		const jitter = (Math.random() - 0.5) * 10;
		switch (actor.action) {
			case "archive":
				spawn("paper", actor.x + jitter, actor.y - 22, { life: 0.8, vy: -18 });
				break;
			case "server":
				spawn("spark", actor.x + jitter, actor.y - 20, { life: 0.6, vy: -22 });
				break;
			case "phone":
			case "coffee":
				break;
			default:
				spawn("key", actor.x + jitter, actor.y - 24, { life: 0.7, vy: -16 });
		}
	}

	// ---------------------------------------------------------------- render

	function render(now) {
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = "#07090d";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.setTransform(scale, 0, 0, scale, offX, offY);

		const occupied = new Set();
		for (const actor of actors.values()) {
			if (!actor.path.length && !actor.action && !actor.inMeeting) occupied.add(actor.seat);
		}
		Office.drawRoom(ctx, now, new Set([...hot, ...lifeHot]), occupied);

		const ordered = [...actors.values()].sort((a, b) => a.y - b.y);
		for (const actor of ordered) Sprites.drawCharacter(ctx, actor, now);
		for (const p of particles) Sprites.drawParticle(ctx, p);

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		for (const actor of ordered) drawLabel(actor);
		for (const actor of ordered) drawBubble(actor);
	}

	function drawLabel(actor) {
		const p = toScreen(actor.x, actor.y - 22);
		const size = Math.max(10 * dpr, Math.round(scale * 3));
		ctx.font = `${size}px ui-monospace, Menlo, monospace`;
		ctx.textAlign = "center";
		ctx.textBaseline = "alphabetic";
		const text = actor.name;
		const w = ctx.measureText(text).width;
		ctx.fillStyle = "rgba(8,11,16,0.72)";
		ctx.fillRect(p.x - w / 2 - 3 * dpr, p.y - size, w + 6 * dpr, size + 4 * dpr);
		ctx.fillStyle = actor.isLead ? "#ffcc4d" : actor.isNpc ? "#9fd6bd" : "#cbd4e2";
		ctx.fillText(text, p.x, p.y);
	}

	function drawBubble(actor) {
		const b = actor.bubble;
		if (!b) return;
		const style =
			b.kind === "think"
				? { bg: "rgba(20,30,52,0.94)", border: "#3d5580", fg: "#a9c6ff" }
				: b.kind === "do"
					? { bg: "rgba(38,30,12,0.94)", border: "#7a6224", fg: "#ffd98a" }
					: b.kind === "life"
						? { bg: "rgba(16,38,32,0.95)", border: "#38715e", fg: "#b7eadb" }
						: { bg: "rgba(16,22,32,0.95)", border: "#4a5668", fg: "#e6ecf6" };

		const size = Math.max(11 * dpr, Math.round(scale * 3.2));
		ctx.font = `${size}px ui-monospace, Menlo, "PingFang SC", monospace`;
		ctx.textAlign = "left";
		ctx.textBaseline = "top";

		const visible = b.text.slice(0, Math.ceil(b.shown));
		const maxW = Math.min(canvas.width * 0.42, 260 * dpr);
		const lines = wrap(visible, maxW);
		const lineH = Math.round(size * 1.35);
		const padX = 6 * dpr;
		const padY = 5 * dpr;
		const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
		const boxH = lines.length * lineH + padY * 2;

		const anchor = toScreen(actor.x, actor.y - 30);
		let x = anchor.x - boxW / 2;
		let y = anchor.y - boxH;
		x = Math.max(4 * dpr, Math.min(canvas.width - boxW - 4 * dpr, x));
		y = Math.max(4 * dpr, y);

		ctx.fillStyle = style.bg;
		ctx.fillRect(x, y, boxW, boxH);
		ctx.strokeStyle = style.border;
		ctx.lineWidth = Math.max(1, dpr);
		ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

		const tipX = Math.max(x + 6 * dpr, Math.min(x + boxW - 10 * dpr, anchor.x - 3 * dpr));
		ctx.fillStyle = style.bg;
		ctx.fillRect(tipX, y + boxH, 6 * dpr, 4 * dpr);
		if (b.kind === "think") {
			ctx.fillRect(tipX + 1 * dpr, y + boxH + 6 * dpr, 3 * dpr, 3 * dpr);
		}

		ctx.fillStyle = style.fg;
		lines.forEach((line, i) => ctx.fillText(line, x + padX, y + padY + i * lineH));
	}

	function wrap(text, maxW) {
		const out = [];
		let line = "";
		for (const ch of text) {
			const test = line + ch;
			if (ctx.measureText(test).width > maxW && line) {
				out.push(line);
				line = ch;
			} else {
				line = test;
			}
			if (out.length >= 3) break;
		}
		if (line && out.length < 3) out.push(line);
		return out.length ? out : [""];
	}

	// ---------------------------------------------------------------- sidebar

	const stateLabel = (state) => t(`state.${state}`);

	function renderCrew() {
		const host = document.getElementById("crew");
		const list = [...actors.values()].filter((actor) => !actor.isNpc).sort(
			(a, b) => Number(b.isLead) - Number(a.isLead) || a.spawnAt - b.spawnAt,
		);
		host.innerHTML = list
			.map((a) => {
				const role = Sprites.roleFor(a.name);
				return `<div class="card">
					<div class="avatar" style="background:${a.palette.shirt}"></div>
					<div class="body">
						<div><span class="name">${esc(a.name)}</span>
						<span class="role">${esc(tx(role ? role.title : a.role ?? ""))}</span>
						<span class="badge ${a.state}">${stateLabel(a.state)}</span></div>
						<div class="detail">${esc(a.detail || a.task || "—")}</div>
						<div class="meta">${isCodexClient ? `${fmtTokens(a.tokens)} tok` : `${fmtTokens(a.tokens)} tok · $${(a.cost ?? 0).toFixed(4)}`}</div>
					</div>
				</div>`;
			})
			.join("");
		const lead = list.find((actor) => actor.isLead);
		replayButton.hidden = !lead;
		const hasActivity = eventHistory.some(isReplayable);
		if (lead) replayButton.textContent = replay
			? t("replay.playing")
			: hasActivity ? `▶ ${t("replay.day", { name: lead.name })}` : t("replay.noActivity");
		replayButton.disabled = !lead || session.busy || Boolean(replay) || !hasActivity;
	}

	function logLine(item) {
		const host = document.getElementById("log");
		const actor = actors.get(item.agentId);
		const el = document.createElement("div");
		el.className = `line ${item.kind}`;
		el.innerHTML = `<span class="who">${esc(actor?.name ?? "·")}</span><span class="txt">${esc(tx(item.text))}</span>`;
		host.appendChild(el);
		while (host.childNodes.length > 220) host.removeChild(host.firstChild);
		host.scrollTop = host.scrollHeight;
	}

	function renderBar() {
		let tokens = 0;
		let cost = 0;
		for (const a of actors.values()) {
			if (a.isNpc) continue;
			tokens += a.tokens ?? 0;
			cost += a.cost ?? 0;
		}
		const effort = session.thinkingLevel ? ` · ${session.thinkingLevel}` : "";
		document.getElementById("model").textContent = `model: ${session.model ?? "—"}${effort}`;
		document.getElementById("turns").textContent = `turn ${session.turns ?? 0}${session.busy ? ` · ${t("status.running")}` : ""}`;
		document.getElementById("usage").textContent = isCodexClient ? `${fmtTokens(tokens)} tok` : `${fmtTokens(tokens)} tok · $${cost.toFixed(4)}`;
	}

	function setTask(text) {
		document.getElementById("task").textContent = text || t("task.empty");
	}

	// ---------------------------------------------------------------- helpers

	const esc = (s) =>
		String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
	const head = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
	const tail = (s, n) => (s.length > n ? `…${s.slice(-n)}` : s);
	const fmtTokens = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n | 0));

	let audio = null;
	function beep(freq, dur) {
		if (!sound) return;
		try {
			audio = audio ?? new (window.AudioContext ?? window.webkitAudioContext)();
			const osc = audio.createOscillator();
			const gain = audio.createGain();
			osc.type = "square";
			osc.frequency.value = freq;
			gain.gain.value = 0.03;
			osc.connect(gain).connect(audio.destination);
			osc.start();
			osc.stop(audio.currentTime + dur);
		} catch {
			sound = false;
		}
	}

	// --------------------------------------------------------------- replay

	function isPriorityLiveEvent(event) {
		if (event.type === "session") return Boolean(event.session?.busy);
		return ["task", "thought", "say", "action", "delegate", "agent_join"].includes(event.type) ||
			(event.type === "agent_state" && !["idle", "done"].includes(event.state));
	}

	function waitForReplay(ms, run) {
		return new Promise((resolve) => {
			run.resolveWait = resolve;
			run.timer = setTimeout(resolve, Math.min(3_000, Math.max(220, ms)));
		});
	}

	async function restoreLiveSnapshot() {
		try {
			const response = await fetch("/api/state", { cache: "no-store" });
			if (response.ok) apply(await response.json());
		} catch {
			// The live SSE stream will deliver the next authoritative event.
		}
	}

	function cancelReplay(restore = false) {
		const run = replay;
		if (!run) return;
		run.cancelled = true;
		if (run.timer) clearTimeout(run.timer);
		run.resolveWait?.();
		replay = null;
		replayStatus.hidden = true;
		renderCrew();
		if (restore) void restoreLiveSnapshot();
	}

	function finishReplay() {
		for (const actor of actors.values()) {
			if (actor.isNpc) continue;
			cancelLife(actor);
			actor.action = null;
			actor.state = "idle";
			actor.detail = t("state.idle");
			retarget(actor);
		}
		session = { ...session, busy: false };
		replay = null;
		replayStatus.textContent = t("replay.complete");
		replayStatus.hidden = false;
		setTimeout(() => { if (!replay) replayStatus.hidden = true; }, 1400);
		renderCrew();
		renderBar();
	}

	async function runHistoryReplay() {
		if (replay || session.busy) return;
		const response = await fetch("/api/state", { cache: "no-store" });
		if (!response.ok) return;
		const latest = await response.json();
		const history = Array.isArray(latest.history) ? latest.history.slice() : [];
		if (!history.some(isReplayable)) {
			replayButton.textContent = t("replay.empty");
			return;
		}
		const run = { cancelled: false, timer: null, resolveWait: null };
		replay = run;
		apply({
			type: "snapshot",
			agents: [],
			log: [],
			session: { ...latest.session, busy: false, turns: 0 },
			history,
		});
		renderCrew();
		let previousAt = history[0].at;
		for (let index = 0; index < history.length; index++) {
			const entry = history[index];
			if (run.cancelled) return;
			await waitForReplay((entry.at - previousAt) / REPLAY_RATE, run);
			if (run.cancelled) return;
			replayStatus.textContent = t("replay.progress", { current: index + 1, total: history.length });
			replayStatus.hidden = false;
			apply(entry.event);
			previousAt = entry.at;
		}
		if (!run.cancelled) finishReplay();
	}

	// ---------------------------------------------------------------- stream

	function connect() {
		const pill = document.getElementById("conn");
		const es = new EventSource("/events");
		es.onopen = () => {
			pill.textContent = t("connection.connected");
			pill.className = "pill online";
		};
		es.onerror = () => {
			pill.textContent = t("connection.reconnecting");
			pill.className = "pill offline";
		};
		es.onmessage = (e) => {
			try {
				const event = JSON.parse(e.data);
				if (event.type !== "snapshot") eventHistory.push({ at: Date.now(), event });
				if (replay) {
					if (isPriorityLiveEvent(event)) cancelReplay(true);
					return;
				}
				apply(event);
			} catch (err) {
				console.error("bad event", err);
			}
		};
	}

	// ---------------------------------------------------------------- demo

	/** Local scripted scene, so the visuals can be reviewed without spending tokens. */
	async function runDemo() {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const now = () => Date.now();
		const log = (agentId, kind, text) => apply({ type: "log", item: { at: now(), agentId, kind, text } });
		Office.startDayPreview?.(24000);

		apply({
			type: "snapshot",
			agents: [
				{
					id: "main",
					name: "啊派",
					role: "主管",
					state: "idle",
					tokens: 0,
					cost: 0,
					toolCalls: 0,
					joinedAt: now(),
					seat: 0,
				},
			],
			log: [],
			session: { cwd: "demo", model: "demo-model", busy: true, turns: 1, startedAt: now() },
		});
		apply({ type: "task", id: "main", task: "给会话存储加上 Redis 缓存" });
		apply({ type: "agent_state", id: "main", state: "thinking", detail: "拆解需求" });
		for (const t of [
			"先看看 session store 现在怎么写的",
			"缓存要能失效，不能只做读缓存",
			"可以并行：一个人摸代码，一个人出方案",
		]) {
			apply({ type: "thought", id: "main", text: t });
			await wait(1500);
		}

		apply({ type: "action", id: "main", action: "archive", label: "查阅 …/core/session-manager.ts", toolCallId: "d1" });
		await wait(2600);
		apply({ type: "action_end", id: "main", toolCallId: "d1", ok: true });

		for (const [id, name, seat, task] of [
			["scout", "scout", 1, "定位 session store 的读写入口"],
			["planner", "planner", 2, "基于侦察结果给出 Redis 缓存方案"],
		]) {
			apply({
				type: "agent_join",
				agent: { id, name, role: "外援", parent: "main", state: "idle", tokens: 0, cost: 0, toolCalls: 0, joinedAt: now(), seat },
			});
			apply({ type: "delegate", from: "main", to: id, task });
			log("main", "delegate", `啊派 → ${name}: ${task}`);
			await wait(4200);
		}
		apply({ type: "agent_state", id: "main", state: "waiting", detail: "等待 2 位同事" });

		apply({ type: "action", id: "scout", action: "server", label: "执行 rg -n 'getSession'", toolCallId: "d2" });
		apply({ type: "agent_state", id: "planner", state: "thinking", detail: "对比方案" });
		apply({ type: "thought", id: "planner", text: "写穿 vs 旁路缓存，先看一致性要求" });
		await wait(2600);
		apply({ type: "action_end", id: "scout", toolCallId: "d2", ok: true });
		apply({ type: "action", id: "scout", action: "archive", label: "查阅 …/store/redis.ts", toolCallId: "d3" });
		await wait(2400);
		apply({ type: "action_end", id: "scout", toolCallId: "d3", ok: true });
		apply({ type: "say", id: "scout", text: "读写都走 SessionManager.load/save，缓存挂这里最省事" });
		apply({ type: "usage", id: "scout", tokens: 8200, cost: 0.0031 });
		await wait(1800);
		apply({ type: "agent_state", id: "scout", state: "done", detail: "已交付" });

		apply({ type: "action", id: "planner", action: "whiteboard", label: "更新任务板", toolCallId: "d4" });
		await wait(2600);
		apply({ type: "action_end", id: "planner", toolCallId: "d4", ok: true });
		apply({ type: "say", id: "planner", text: "方案：旁路缓存 + 写时失效，30s TTL 兜底" });
		apply({ type: "usage", id: "planner", tokens: 12400, cost: 0.0088 });
		apply({ type: "agent_state", id: "planner", state: "done", detail: "已交付" });
		await wait(1400);

		apply({ type: "action", id: "main", action: "type", label: "修改 …/core/session-manager.ts", toolCallId: "d5" });
		await wait(3200);
		apply({ type: "action_end", id: "main", toolCallId: "d5", ok: true });
		apply({ type: "action", id: "main", action: "server", label: "执行 npm test -- session", toolCallId: "d6" });
		await wait(3000);
		apply({ type: "action_end", id: "main", toolCallId: "d6", ok: true });
		apply({ type: "usage", id: "main", tokens: 46200, cost: 0.184 });
		apply({ type: "say", id: "main", text: "缓存接好了，测试通过。要不要我再补一个压测脚本？" });
		await wait(1500);
		apply({ type: "agent_state", id: "main", state: "idle", detail: "待命" });
		apply({ type: "session", session: { cwd: "demo", model: "demo-model", busy: false, turns: 3, startedAt: now() } });
		await wait(20000);
		apply({ type: "agent_leave", id: "scout", ok: true });
		apply({ type: "agent_leave", id: "planner", ok: true });
	}

	// ---------------------------------------------------------------- boot

	document.getElementById("demo").addEventListener("click", () => void runDemo());
	replayButton.addEventListener("click", () => void runHistoryReplay());
	document.getElementById("mute").addEventListener("click", (e) => {
		sound = !sound;
		e.target.textContent = t(sound ? "nav.soundOn" : "nav.soundOff");
	});

	resize();
	renderBar();
	let last = performance.now();
	function frame(now) {
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		update(dt, now);
		render(now);
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (new URLSearchParams(location.search).has("demo")) void runDemo();
	else connect();
})();
