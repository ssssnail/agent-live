#!/usr/bin/env node
/**
 * Headless check for the static Preset path and the Canvas renderers.
 *
 * Static hosts (the preview server, a published demo) resolve Preset Offices
 * without the local runtime, and every shipped Preset has to boot and draw in
 * that mode. This runs the real content loader and the real renderers against a
 * minimal Canvas surface, so a missing scope, a bad palette index or a broken
 * Preset fails here instead of in the browser.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SCENE_LIMITS } from "../src/core/limits.ts";
import { createEnvironmentRuntime } from "../web/v2/environment-runtime.js";
import { validateRegistry } from "../web/v2/graph-validator.js";
import { createOfficeEngine } from "../web/v2/office-engine.js";
import { createOfficeRenderer } from "../web/v2/office-renderer.js";
import { createSpriteRenderer } from "../web/v2/sprite-renderer.js";
import { loadPresetContent } from "../web/v2/static-content.js";

const contentRoot = new URL("../web/v2/content/", import.meta.url);
const readJson = async (relative) => JSON.parse(await readFile(new URL(relative, contentRoot), "utf8"));

const GRADIENT = { addColorStop() {} };
const CONTEXT_METHODS = [
	"save", "restore", "beginPath", "closePath", "moveTo", "lineTo", "rect", "fill", "fillRect",
	"stroke", "strokeRect", "clip", "drawImage", "fillText", "translate", "scale", "rotate",
	"arc", "ellipse", "quadraticCurveTo", "bezierCurveTo", "clearRect", "setTransform",
];
function createContext() {
	const context = {
		measureText: (text) => ({ width: String(text).length * 4 }),
		createLinearGradient: () => GRADIENT,
		createRadialGradient: () => GRADIENT,
	};
	for (const name of CONTEXT_METHODS) context[name] = () => {};
	return context;
}

// Renderers reach the i18n bridge and build one offscreen Canvas for the floor.
globalThis.window = { AgentLiveI18n: { text: (value) => value } };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => createContext() }) };

const context = createContext();
const catalog = await readJson("catalog.json");
assert.equal(catalog.kind, "preset-catalog");
assert.ok(catalog.presets.length >= 8, "this check must cover every shipped Preset Office");

const POSES = ["stand", "walk", "sit", "type"];
const PARTICLE_KINDS = ["key", "think", "spark", "paper"];
const PALETTE_KEYS = ["skin", "hair", "shirt", "trim", "badge"];
let staticWeatherPresets = 0;

for (const entry of catalog.presets) {
	const content = await loadPresetContent(entry.id, readJson);
	validateRegistry(content);
	assert.ok(content.agentProfile?.appearance, `${entry.id}: the static path must resolve an Agent Profile`);
	assert.ok(content.layout.propInstances.length <= SCENE_LIMITS.props, `${entry.id}: more props than the scene limit allows`);
	assert.ok(content.npcs.entries.length <= SCENE_LIMITS.npcs, `${entry.id}: more NPCs than the scene limit allows`);
	assert.ok(content.lifeActivities.entries.length <= SCENE_LIMITS.activities, `${entry.id}: more activities than the scene limit allows`);

	const environment = createEnvironmentRuntime(content.environment);
	const sprites = createSpriteRenderer(content);
	const effects = new Set(content.atmosphere.ambientEffects ?? []);
	// Draw with the Office environment and with the engine fallback, so both the
	// dynamic and the Atmosphere-driven weather paths of every Preset run.
	const runtimes = [environment, null];
	for (const runtime of runtimes) {
		const engine = createOfficeEngine(content, runtime);
		assert.deepEqual([...engine.AMBIENT_EFFECTS].sort(), [...effects].sort(), `${entry.id}: the engine must expose the Atmosphere effects the window renderer reads`);
		if (!engine.currentEnvironment().dynamicWeather) staticWeatherPresets += 1;
		const renderer = createOfficeRenderer(content, runtime);
		for (const t of [0, 1200, 48000]) renderer.drawRoom(context, t, new Set(["desk0", "phone"]), new Set([0]));
	}

	const roleName = content.npcs.entries.find((npc) => npc.role)?.name ?? "";
	const ids = [...content.npcs.entries.map((npc) => npc.id), ...Array.from({ length: 256 }, (_, index) => `agent-${index}`)];
	for (const id of ids) {
		for (const isLead of [false, true]) {
			const palette = sprites.paletteFor(id, roleName, isLead);
			for (const key of PALETTE_KEYS) assert.ok(palette[key], `${entry.id}: palette.${key} is undefined for ${id}`);
		}
	}

	for (const npc of content.npcs.entries) {
		const palette = { ...sprites.paletteFor(npc.id, npc.role ?? roleName, false), ...(npc.appearance ?? {}) };
		for (const pose of POSES) {
			sprites.drawCharacter(context, { id: npc.id, name: npc.name, pose, dir: "down", seed: 1, walkPhase: 0.3, x: 100, y: 100, palette }, 1200);
		}
	}
	for (const kind of PARTICLE_KINDS) sprites.drawParticle(context, { kind, x: 10, y: 10, life: 1, maxLife: 2 });

	console.log(`  ${entry.id}: drew ${content.layout.propInstances.length} props and ${content.npcs.entries.length} NPCs`);
}

// The Atmosphere-driven weather branch is the one that reads the engine's effect
// set; if no Preset ever took it this check would not cover the window renderer.
assert.ok(staticWeatherPresets > 0, "no Preset Office exercised the Atmosphere-driven weather branch");

console.log(`Render validation passed: ${catalog.presets.length} Preset Offices resolve and draw statically (${staticWeatherPresets} static-weather renders)`);
