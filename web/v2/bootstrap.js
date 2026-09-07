import { createOfficeRenderer } from "./office-renderer.js";
import { createSpriteRenderer } from "./sprite-renderer.js";

/**
 * Config-driven boot path for the preserved Demo.
 *
 * All scene and character rendering is native to V2 and is constructed from
 * the selected Office Preset. The fixed event runtime is loaded only after the
 * content graph has been resolved and validated.
 */

const CONTENT_ROOT = "/v2/content";
const DEFAULT_PRESET = "refined-demo";
const PRESET_STORAGE_KEY = "agent-office:selected-preset";

function savedPreset() {
	try {
		return localStorage.getItem(PRESET_STORAGE_KEY);
	} catch {
		return null;
	}
}

function rememberPreset(presetId) {
	try {
		localStorage.setItem(PRESET_STORAGE_KEY, presetId);
	} catch {
		// Storage may be disabled; the selected query parameter still works.
	}
}

function forgetPreset() {
	try {
		localStorage.removeItem(PRESET_STORAGE_KEY);
	} catch {
		// Nothing else to clean up.
	}
}

async function readJson(relativePath) {
	const response = await fetch(`${CONTENT_ROOT}/${relativePath}`);
	if (!response.ok) throw new Error(`无法加载内容：${relativePath} (${response.status})`);
	return response.json();
}

async function loadPreset(presetId) {
	const preset = await readJson(`presets/${presetId}.json`);
	assertManifest(preset, "preset");
	const refs = preset.content ?? {};
	const [style, layout, agentSkin, props, npcs, lifeActivities, atmosphere] = await Promise.all([
		readJson(`styles/${refs.style}.json`),
		readJson(`layouts/${refs.layout}.json`),
		readJson(`agent-skins/${refs.agentSkin}.json`),
		readJson(`props/${refs.props}.json`),
		readJson(`npcs/${refs.npcs}.json`),
		readJson(`life-activities/${refs.lifeActivities}.json`),
		readJson(`atmospheres/${refs.atmosphere}.json`),
	]);
	const registry = { preset, style, layout, agentSkin, props, npcs, lifeActivities, atmosphere };
	validateRegistry(registry);
	return Object.freeze(registry);
}

function assertManifest(value, kind) {
	if (!value || value.schemaVersion !== 1 || value.kind !== kind || !value.id || !value.version) {
		throw new Error(`无效的 ${kind} 内容清单`);
	}
}

function validateRegistry(content) {
	for (const [key, value] of Object.entries(content)) {
		if (key === "preset") continue;
		assertManifest(value, key === "agentSkin" ? "agent-skin" : key === "lifeActivities" ? "life-activities" : key);
	}
	const { layout, props, npcs, lifeActivities } = content;
	if (layout.contract !== "single-office-v1") throw new Error(`不支持的 Layout 合同：${layout.contract}`);
	if (layout.canvas?.width !== 384 || layout.canvas?.height !== 216) throw new Error("single-office-v1 必须使用 384×216 逻辑画布");
	if (!Array.isArray(layout.seats) || layout.seats.length !== 8) throw new Error("Demo Layout 必须提供 8 个座位");
	if (!Array.isArray(layout.navigation?.lanes) || !layout.navigation.lanes.length) throw new Error("Layout 缺少导航通道");

	const propTypes = new Set(Object.keys(props.types ?? {}));
	const propInstances = new Set();
	for (const instance of layout.propInstances ?? []) {
		if (!propTypes.has(instance.type)) throw new Error(`未知 Prop Type：${instance.type}`);
		if (!instance.id || propInstances.has(instance.id)) throw new Error(`重复或无效的 Prop 实例：${instance.id ?? "—"}`);
		propInstances.add(instance.id);
	}
	const required = ["research", "create", "compute", "plan", "communicate", "collaborate"];
	for (const capability of required) {
		if (!layout.stations?.[capability]) throw new Error(`Layout 缺少工作能力：${capability}`);
	}
	for (const npc of npcs.entries ?? []) {
		if (!npc.id || !npc.role || !layout.targets?.[npc.spawn]) throw new Error(`无效的 NPC：${npc.id ?? "—"}`);
	}
	for (const activity of lifeActivities.entries ?? []) {
		if (!activity.id || !["agent", "npc"].includes(activity.participant?.kind) || !activity.steps?.length) {
			throw new Error(`无效的 Life Activity：${activity.id ?? "—"}`);
		}
		for (const requiredProp of activity.requires ?? []) {
			if (!propInstances.has(requiredProp)) throw new Error(`${activity.id} 缺少 Prop：${requiredProp}`);
		}
		for (const step of activity.steps) {
			if (!layout.targets?.[step.target]) throw new Error(`${activity.id} 缺少 Target：${step.target}`);
		}
	}
}

function applyStyle(style, atmosphere) {
	const root = document.documentElement;
	for (const [name, value] of Object.entries(style.tokens?.css ?? {})) root.style.setProperty(`--${name}`, value);
	for (const [name, value] of Object.entries(atmosphere.styleOverrides?.css ?? {})) root.style.setProperty(`--${name}`, value);
	document.documentElement.dataset.officePreset = style.id;
}

function installOfficeAdapter(content) {
	window.Office = createOfficeRenderer(content);
}

function installSpriteAdapter(content) {
	window.Sprites = createSpriteRenderer(content);
}

async function installPresetPicker(selectedId) {
	const catalog = await readJson("catalog.json");
	if (catalog.schemaVersion !== 1 || catalog.kind !== "preset-catalog" || !Array.isArray(catalog.presets)) {
		throw new Error("无效的 Preset Catalog");
	}
	const select = document.getElementById("preset");
	for (const item of catalog.presets) {
		const option = document.createElement("option");
		option.value = item.id;
		option.textContent = item.name;
		option.selected = item.id === selectedId;
		select.appendChild(option);
	}
	select.addEventListener("change", () => {
		rememberPreset(select.value);
		const query = new URLSearchParams(location.search);
		query.set("preset", select.value);
		location.search = query.toString();
	});
}

function loadRuntime() {
	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = "/app.js";
		script.onload = resolve;
		script.onerror = () => reject(new Error("Office Runtime 加载失败"));
		document.body.appendChild(script);
	});
}

function showBootError(error) {
	console.error(error);
	const pill = document.getElementById("conn");
	pill.textContent = "配置错误";
	pill.className = "pill offline";
	const log = document.getElementById("log");
	log.innerHTML = `<div class="line system"><span class="who">系统</span><span class="txt"></span></div>`;
	log.querySelector(".txt").textContent = error instanceof Error ? error.message : String(error);
}

try {
	const query = new URLSearchParams(location.search);
	const requestedPreset = query.get("preset");
	const storedPreset = savedPreset();
	let presetId = requestedPreset ?? storedPreset ?? DEFAULT_PRESET;
	let content;
	try {
		content = await loadPreset(presetId);
	} catch (error) {
		if (requestedPreset || !storedPreset || presetId === DEFAULT_PRESET) throw error;
		forgetPreset();
		presetId = DEFAULT_PRESET;
		content = await loadPreset(presetId);
	}
	rememberPreset(presetId);
	window.OfficeContent = content;
	applyStyle(content.style, content.atmosphere);
	await installPresetPicker(presetId);
	installOfficeAdapter(content);
	installSpriteAdapter(content);
	await loadRuntime();
} catch (error) {
	showBootError(error);
}
