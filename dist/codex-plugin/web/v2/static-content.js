import { assertManifest } from "./graph-validator.js";

/**
 * Preset content refs, in the order the resolved registry reports them.
 * `preset.content` names one file per key, relative to its content directory.
 */
export const PRESET_CONTENT_SOURCES = Object.freeze({
	style: "styles",
	layout: "layouts",
	agentSkin: "agent-skins",
	props: "props",
	npcs: "npcs",
	lifeActivities: "life-activities",
	atmosphere: "atmospheres",
	environment: "environments",
});

function agentProfileFrom(profileTemplates) {
	const templateId = profileTemplates?.defaultTemplate ?? "builtin/host-agent";
	const template = (profileTemplates?.entries ?? []).find((entry) => entry.id === templateId);
	// Mirrors the Office Spec compiler: the host keeps the identity reported by its
	// adapter, and the Agent Profile template supplies the display defaults.
	return { template: template?.id ?? templateId, appearance: { ...(template?.defaultAppearance ?? {}) } };
}

/**
 * Resolve one Preset Office without a local runtime.
 *
 * Static hosts — the preview server, a published demo — have no Office registry
 * to compile an Office Spec from, so the Preset's own content refs are read
 * directly. The result is the same graph shape `/api/office-content` serves,
 * which is what the validators and the renderers require.
 */
export async function loadPresetContent(presetId, readJson) {
	const preset = await readJson(`presets/${presetId}.json`);
	assertManifest(preset, "preset");
	const refs = preset.content ?? {};
	const names = Object.keys(PRESET_CONTENT_SOURCES);
	const [loaded, profileTemplates] = await Promise.all([
		Promise.all(names.map((key) => readJson(`${PRESET_CONTENT_SOURCES[key]}/${refs[key]}.json`))),
		readJson("component-library/agent-profile-templates.json"),
	]);
	const content = Object.fromEntries(names.map((key, index) => [key, loaded[index]]));
	for (const key of names) {
		if (!content[key]) throw new Error(`Preset ${presetId} is missing its ${key} content`);
	}
	return { preset, ...content, agentProfile: agentProfileFrom(profileTemplates) };
}
