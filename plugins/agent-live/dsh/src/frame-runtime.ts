import { createEnvironmentRuntime } from "../../web/v2/environment-runtime.js";
import { createOfficeRenderer } from "../../web/v2/office-renderer.js";
import { createSpriteRenderer } from "../../web/v2/sprite-renderer.js";
import preset from "../../web/v2/content/presets/tech-open-office.json";
import style from "../../web/v2/content/styles/pixel-classic.json";
import layout from "../../web/v2/content/layouts/tech-open-office.json";
import agentSkin from "../../web/v2/content/agent-skins/tiny-developers.json";
import props from "../../web/v2/content/props/tech-office.json";
import npcs from "../../web/v2/content/npcs/tech-office-staff.json";
import lifeActivities from "../../web/v2/content/life-activities/tech-office-routines.json";
import atmosphere from "../../web/v2/content/atmospheres/default.json";
import environment from "../../web/v2/content/environments/local-office.json";
import locale from "../../web/v2/locales/en.json";

const fallbackContent = { preset, style, layout, agentSkin, props, npcs, lifeActivities, atmosphere, environment };
const content = window.AgentLiveInitialContent ?? fallbackContent;
const listeners = new Set<(event: unknown) => void>();
let latest: unknown = null;

const interpolate = (source: string, vars: Record<string, unknown> = {}) => {
  let value = source;
  for (const [key, replacement] of Object.entries(vars)) value = value.replaceAll(`{${key}}`, String(replacement));
  return value;
};

window.AgentLiveI18n = {
  locale: "en",
  t(key: string, vars?: Record<string, unknown>) {
    return interpolate((locale as { strings?: Record<string, string> }).strings?.[key] ?? key, vars);
  },
  text(value: unknown) {
    return (locale as { text?: Record<string, string> }).text?.[String(value ?? "")] ?? String(value ?? "");
  },
};
window.AgentLiveClientKind = "dsh";
window.OfficeContent = content;
window.SceneLimits = { agents: 16, npcs: 12, props: 96, activities: 32, effects: 40, visibleBubbles: 4, queuedBubbles: 8 };
const environmentRuntime = createEnvironmentRuntime(environment);
window.Office = createOfficeRenderer(content, environmentRuntime);
window.Sprites = createSpriteRenderer(content);
window.AgentLiveSubscribe = (listener: (event: unknown) => void) => {
  listeners.add(listener);
  if (latest) listener(latest);
  return () => listeners.delete(listener);
};
window.AgentLiveGetSnapshot = async () => latest;
window.addEventListener("message", (message) => {
	if (message.source !== parent || message.data?.source !== "agent-live-dsh" || !message.data.event) return;
  const event = message.data.event;
  if (event.type === "snapshot") latest = event;
  else if (latest && typeof latest === "object") {
    const snapshot = latest as { history?: Array<{ at: number; event: unknown }> };
    snapshot.history = [...(snapshot.history ?? []), { at: Date.now(), event }].slice(-800);
  }
  for (const listener of listeners) listener(event);
});

void import("../../web/app.js").then(() => parent.postMessage({ source: "agent-live-dsh-frame", type: "ready" }, "*"));

declare global {
  interface Window {
    AgentLiveI18n: unknown;
    AgentLiveClientKind: string;
    OfficeContent: unknown;
    SceneLimits: unknown;
    Office: unknown;
    Sprites: unknown;
    AgentLiveSubscribe: (listener: (event: any) => void) => () => void;
    AgentLiveGetSnapshot: () => Promise<any>;
	AgentLiveInitialContent?: typeof fallbackContent;
  }
}
