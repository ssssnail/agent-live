import { createOfficeRenderer } from "./office-renderer.js";
import { createSpriteRenderer } from "./sprite-renderer.js";
import { createEnvironmentRuntime } from "./environment-runtime.js";
import { loadI18n } from "./i18n.js";
import { loadPresetContent } from "./static-content.js";
import { validateRegistry } from "./graph-validator.js";

/**
 * Config-driven boot path for the preserved Demo.
 *
 * All scene and character rendering is native to V2 and is constructed from
 * the selected Office Preset. The fixed event runtime is loaded only after the
 * content graph has been resolved and validated.
 */

const CONTENT_ROOT = "/v2/content";
const DEFAULT_PRESET = "tech-open-office";
const PRESET_STORAGE_KEY = "agent-live:selected-preset";
let officeApiAvailable;
const token = new URLSearchParams(location.search).get("token") ?? "";
const apiFetch = (url, options = {}) => fetch(url, { cache: "no-store", ...options, headers: { ...options.headers, ...(token ? { "x-agent-live-token": token } : {}) } });

async function hasOfficeApi() {
	if (officeApiAvailable !== undefined) return officeApiAvailable;
	try {
		officeApiAvailable = (await apiFetch("/api/offices")).ok;
	} catch {
		officeApiAvailable = false;
	}
	return officeApiAvailable;
}

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

async function loadPreset(presetId, limits) {
	const registry = await loadPresetContent(presetId, readJson);
	applySceneLimits(registry, limits);
	validateRegistry(registry);
	return Object.freeze(registry);
}

async function loadOffice(officeId, limits) {
	const params = new URLSearchParams();
	if (officeId) params.set("id", officeId);
	const response = await apiFetch(`/api/office-content?${params}`);
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.error ?? `Unable to load office ${officeId}`);
	}
	const registry = await response.json();
	applySceneLimits(registry, limits);
	validateRegistry(registry);
	return Object.freeze(registry);
}

async function loadOfficialOffice(presetId, limits) {
	const apiAvailable = await hasOfficeApi();
	return apiAvailable ? loadOffice(`builtin/${presetId}`, limits) : loadPreset(presetId, limits);
}

function installContentReload(query) {
	const officeId = query.get("office");
	const events = new EventSource("/api/content-events?" + new URLSearchParams({ token }));
	let reloadTimer;
	events.onmessage = (event) => {
		const change = JSON.parse(event.data);
		if (change.type !== "office" || !change.officeId) return;
		// A customization saves and selects. Coalesce its notifications into one
		// navigation instead of interrupting a page that is already reloading.
		clearTimeout(reloadTimer);
		reloadTimer = setTimeout(() => {
			if (officeId === change.officeId) return location.reload();
			const next = new URL(location.href);
			next.searchParams.set("office", change.officeId);
			next.searchParams.delete("preset");
			location.replace(next);
		}, 80);
	};
	window.addEventListener("pagehide", () => { clearTimeout(reloadTimer); events.close(); }, { once: true });
}

function applySceneLimits(content, limits) {
	const trim = (owner, key, max, label) => {
		const list = owner?.[key];
		if (!Array.isArray(list) || list.length <= max) return;
		console.warn(`Agent Live: ${label} ${list.length} exceeds ${max}; extra items were ignored.`);
		owner[key] = list.slice(0, max);
	};
	trim(content.layout, "propInstances", limits.props, "props");
	trim(content.npcs, "entries", limits.npcs, "NPCs");
	trim(content.lifeActivities, "entries", limits.activities, "life activities");
}


function applyStyle(style, atmosphere) {
	const root = document.documentElement;
	for (const [name, value] of Object.entries(style.tokens?.css ?? {})) root.style.setProperty(`--${name}`, value);
	for (const [name, value] of Object.entries(atmosphere.styleOverrides?.css ?? {})) root.style.setProperty(`--${name}`, value);
	document.documentElement.dataset.officePreset = style.id;
}

function installEnvironmentAdapter(content, query) {
	const runtime = createEnvironmentRuntime(content.environment);
	const overrides = {};
	if (query.has("time")) overrides.time = query.get("time");
	if (query.has("weather")) overrides.weather = query.get("weather");
	if (Object.keys(overrides).length) runtime.update(overrides);
	window.OfficeEnvironment = runtime;
	window.addEventListener("agent-live:environment", (event) => {
		try {
			runtime.update(event.detail ?? {});
		} catch (error) {
			console.warn("无法应用环境更新", error);
		}
	});
	return runtime;
}

function installOfficeAdapter(content, environment) {
	window.Office = createOfficeRenderer(content, environment);
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
	let items = catalog.presets.filter((entry) => entry.visibility !== "internal" || entry.id === selectedId).map((entry) => ({ ...entry, value: `builtin/${entry.id}` }));
	try {
		if (!await hasOfficeApi()) throw new Error("office API unavailable");
		const response = await apiFetch("/api/offices");
		if (response.ok) {
			const offices = await response.json();
			for (const office of offices.filter((entry) => entry.origin === "custom")) items.push({ id: office.id, value: office.id, name: office.name });
		}
	} catch {
		// Static preview servers do not expose local Custom Offices.
	}
	for (const item of items) {
		const option = document.createElement("option");
		option.value = item.value;
		option.textContent = window.AgentLiveI18n?.text(item.name) ?? item.name;
		option.selected = item.value === selectedId;
		select.appendChild(option);
	}
	select.addEventListener("change", async () => {
		if (token && await hasOfficeApi()) {
			select.disabled = true;
			try {
				const response = await apiFetch("/api/office-selection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: select.value }) });
				if (!response.ok) throw new Error("Unable to select office");
				const next = new URL(location.href);
				next.searchParams.delete("preset");
				next.searchParams.delete("office");
				location.replace(next);
			} catch (error) { select.disabled = false; showBootError(error); }
			return;
		}
		const query = new URLSearchParams(location.search);
		if (select.value.startsWith("local/")) {
			query.set("office", select.value);
			query.delete("preset");
		} else {
			const preset = select.value.replace(/^builtin\//, "");
			rememberPreset(preset);
			query.set("preset", preset);
			query.delete("office");
		}
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

async function loadCodexControls(query) {
	if (query.get("client") !== "codex") return;
	const module = await import("./codex-controls.js");
	module.installCodexControls(query.get("token") ?? "");
}

function showBootError(error) {
	console.error(error);
	const pill = document.getElementById("conn");
	pill.textContent = window.AgentLiveI18n?.t("config.error") ?? "Configuration error";
	pill.className = "pill offline";
	const log = document.getElementById("log");
	log.innerHTML = `<div class="line system"><span class="who">系统</span><span class="txt"></span></div>`;
	log.querySelector(".txt").textContent = error instanceof Error ? error.message : String(error);
}

try {
	const query = new URLSearchParams(location.search);
	const limitsResponse = await fetch("/api/scene-limits", { cache: "no-store" });
	if (!limitsResponse.ok) throw new Error("无法加载场景容量规则");
	window.SceneLimits = await limitsResponse.json();
	await loadI18n(query);
	const devControls = document.getElementById("devControls");
	devControls.hidden = query.get("dev") !== "1" && query.get("demo") !== "1";
	const requestedPreset = query.get("preset");
	const requestedOffice = query.get("office");
	const storedPreset = savedPreset();
	let presetId = requestedPreset ?? storedPreset ?? DEFAULT_PRESET;
	let content;
	let selectedId;
	if (!requestedOffice && !requestedPreset && await hasOfficeApi()) {
		content = await loadOffice(undefined, window.SceneLimits);
		selectedId = content.preset.id;
	} else if (requestedOffice) {
		if (!await hasOfficeApi()) throw new Error("Custom Offices require the Agent Live local runtime");
		content = await loadOffice(requestedOffice, window.SceneLimits);
		selectedId = requestedOffice;
	} else {
		try {
			content = await loadOfficialOffice(presetId, window.SceneLimits);
		} catch (error) {
			if (requestedPreset || !storedPreset || presetId === DEFAULT_PRESET) throw error;
			forgetPreset();
			presetId = DEFAULT_PRESET;
			content = await loadOfficialOffice(presetId, window.SceneLimits);
		}
		rememberPreset(presetId);
		selectedId = `builtin/${presetId}`;
	}
	window.OfficeContent = content;
	applyStyle(content.style, content.atmosphere);
	await installPresetPicker(selectedId);
	installContentReload(query);
	const environment = installEnvironmentAdapter(content, query);
	installOfficeAdapter(content, environment);
	installSpriteAdapter(content);
	await loadRuntime();
	await loadCodexControls(query);
} catch (error) {
	showBootError(error);
}
