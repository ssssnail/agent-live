import { createOfficeRenderer } from "./office-renderer.js";
import { createSpriteRenderer } from "./sprite-renderer.js";

const legacyOffice = window.Office;
const legacySprites = window.Sprites;
const root = "/v2/content";
const read = async (path) => (await fetch(`${root}/${path}`)).json();

function canvas(width, height) {
	const node = document.createElement("canvas");
	node.width = width;
	node.height = height;
	return node;
}

function pixelDiff(a, b) {
	const left = a.getContext("2d").getImageData(0, 0, a.width, a.height).data;
	const right = b.getContext("2d").getImageData(0, 0, b.width, b.height).data;
	let changed = 0;
	for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) changed++;
	return changed;
}

const [style, layout, agentSkin, props, npcs, lifeActivities, atmosphere, preset] = await Promise.all([
	read("styles/pixel-classic.json"),
	read("layouts/demo-office.json"),
	read("agent-skins/tiny-developers.json"),
	read("props/default-office.json"),
	read("npcs/none.json"),
	read("life-activities/none.json"),
	read("atmospheres/default.json"),
	read("presets/demo-office.json"),
]);
const content = { style, layout, agentSkin, props, npcs, lifeActivities, atmosphere, preset };
const nativeOffice = createOfficeRenderer(content);
const nativeSprites = createSpriteRenderer(content);
const results = [];

for (const test of [
	{ name: "room-idle", t: 0, hot: [], occupied: [] },
	{ name: "room-desks", t: 777, hot: ["desk0", "desk5"], occupied: [0, 1, 5] },
	{ name: "room-archive", t: 1733, hot: ["archive"], occupied: [2] },
	{ name: "room-server", t: 2345, hot: ["server"], occupied: [4, 6] },
	{ name: "room-board-phone-coffee", t: 3891, hot: ["whiteboard", "phone", "coffee"], occupied: [7] },
]) {
	const oldCanvas = canvas(384, 216);
	const newCanvas = canvas(384, 216);
	legacyOffice.drawRoom(oldCanvas.getContext("2d"), test.t, new Set(test.hot), new Set(test.occupied));
	nativeOffice.drawRoom(newCanvas.getContext("2d"), test.t, new Set(test.hot), new Set(test.occupied));
	results.push({ name: test.name, changedChannels: pixelDiff(oldCanvas, newCanvas) });
}

for (const test of [
	{ name: "actor-lead", id: "main", role: "阿派", lead: true, state: "thinking", pose: "sit", dir: "up", t: 800 },
	{ name: "actor-scout", id: "scout", role: "scout", lead: false, state: "working", pose: "walk", dir: "right", t: 1400 },
	{ name: "actor-planner", id: "planner", role: "planner", lead: false, state: "done", pose: "talk", dir: "left", t: 2300 },
]) {
	const oldCanvas = canvas(48, 48);
	const newCanvas = canvas(48, 48);
	const base = { id: test.id, name: test.role, x: 24, y: 38, state: test.state, pose: test.pose, dir: test.dir, seed: 2, walkPhase: 0.42 };
	legacySprites.drawCharacter(oldCanvas.getContext("2d"), { ...base, palette: legacySprites.paletteFor(test.id, test.role, test.lead) }, test.t);
	nativeSprites.drawCharacter(newCanvas.getContext("2d"), { ...base, palette: nativeSprites.paletteFor(test.id, test.role, test.lead) }, test.t);
	results.push({ name: test.name, changedChannels: pixelDiff(oldCanvas, newCanvas) });
}

for (const [index, kind] of ["key", "paper", "check", "bang", "cross", "spark", "unknown"].entries()) {
	const oldCanvas = canvas(24, 24);
	const newCanvas = canvas(24, 24);
	const particle = { kind, x: 12, y: 12, life: 0.7, maxLife: 1 };
	legacySprites.drawParticle(oldCanvas.getContext("2d"), { ...particle });
	nativeSprites.drawParticle(newCanvas.getContext("2d"), { ...particle });
	results.push({ name: `particle-${index}-${kind}`, changedChannels: pixelDiff(oldCanvas, newCanvas) });
}

const failures = results.filter((result) => result.changedChannels !== 0);
const output = document.getElementById("result");
output.textContent = failures.length
	? `FAIL\n${failures.map((failure) => `${failure.name}: ${failure.changedChannels}`).join("\n")}`
	: `PASS ${results.length} pixel parity cases`;
document.documentElement.dataset.parity = failures.length ? "fail" : "pass";
