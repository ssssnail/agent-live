import { createEnvironmentRuntime } from "../../web/v2/environment-runtime.js";
import { createOfficeRenderer } from "../../web/v2/office-renderer.js";
import { createSpriteRenderer } from "../../web/v2/sprite-renderer.js";
import { graphIssueMessages } from "../../web/v2/graph-validator.js";
import { SCENE_LIMITS } from "../../src/core/limits.ts";
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

const fallbackContent = {
  preset, style, layout, agentSkin, props, npcs, lifeActivities, atmosphere, environment,
  agentProfile: { template: "builtin/host-agent", appearance: {} },
};
const injected = window.AgentLiveInitialContent;
const content = injected ?? fallbackContent;
const contentProblems = graphIssueMessages(content);

// Nothing unrenderable may reach the renderers. The host's projection is data, so
// an invalid one gets an explicit failure state; a broken bundled fallback means
// the published package itself is corrupt, so that one must fail loudly.
if (contentProblems.length) {
  reportUnrenderableContent(contentProblems, !injected);
} else {
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
  window.SceneLimits = { ...SCENE_LIMITS };
  const environmentRuntime = createEnvironmentRuntime(content.environment);
  window.OfficeEnvironment = environmentRuntime;
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
}

/**
 * Shows why this view cannot render instead of handing content to renderers that
 * would misinterpret it. The host treats any frame message as its handshake, so
 * posting here also keeps the view from waiting forever.
 */
function reportUnrenderableContent(problems: string[], fatal: boolean): void {
  const message = `Agent Live content is not renderable — ${problems.join("; ")}`;
  console.error(message);
  renderFailureState(message);
  parent.postMessage({ source: "agent-live-dsh-frame", type: "invalid-content", problems }, "*");
  if (fatal) throw new Error(message);
}

function renderFailureState(message: string): void {
  const host = document.getElementById("stageWrap") ?? document.body;
  const panel = document.createElement("div");
  panel.setAttribute("role", "alert");
  panel.dataset.agentLiveError = "content";
  panel.style.cssText = [
    "position:absolute", "inset:12px", "z-index:5", "display:flex", "flex-direction:column",
    "justify-content:center", "gap:8px", "padding:16px", "overflow:auto",
    "background:rgba(13,16,23,0.94)", "border:1px solid #5c3a2c", "color:#ff8f6b",
    "font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace", "white-space:pre-wrap",
  ].join(";");
  const title = document.createElement("strong");
  title.textContent = "Agent Live 无法渲染这份内容";
  const detail = document.createElement("span");
  detail.textContent = message;
  panel.append(title, detail);
  host.appendChild(panel);
}

declare global {
  interface Window {
    AgentLiveI18n: unknown;
    AgentLiveClientKind: string;
    OfficeContent: unknown;
    SceneLimits: unknown;
    Office: unknown;
    OfficeEnvironment: unknown;
    Sprites: unknown;
    AgentLiveSubscribe: (listener: (event: any) => void) => () => void;
    AgentLiveGetSnapshot: () => Promise<any>;
	AgentLiveInitialContent?: typeof fallbackContent;
  }
}
