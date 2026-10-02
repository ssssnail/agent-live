import type { Context } from "@deepseek-ai/cordis";
import type { SessionListState, SessionSnapshot } from "@deepseek-ai/dsh-api-session-controller/client";
import type { ConversationSnapshot, ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type { SessionStatusSnapshot } from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-subagent/client";
import React from "react";
import frameDocument from "agent-live-frame-document";
import type {} from "./creator.ts";
import { DshSnapshotAdapter } from "./adapter.ts";
import { buildObservation, projectedTokenCount } from "./observation.ts";
import type { OfficeEvent } from "../../src/core/protocol.ts";

export const inject = ["slots"];

interface ViewSessionStore {
  adapter: DshSnapshotAdapter;
  journal: OfficeEvent[];
  touchedAt: number;
}

const viewSessions = new Map<string, ViewSessionStore>();
const MAX_VIEW_SESSIONS = 24;
const LOCALE_STORAGE_KEY = "agent-live:locale";
type Locale = "en" | "zh-CN";

function readLocale(value: unknown): Locale {
  return String(value ?? "").toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function savedLocale(): Locale {
  try {
    return readLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return "en";
  }
}

// The language choice is a product preference, not a per-view one: every open
// conversation view switches together and the choice survives a page reload.
let activeLocale: Locale = savedLocale();
const localeWatchers = new Set<(locale: Locale) => void>();

function applyLocale(next: Locale): void {
  if (next === activeLocale) return;
  activeLocale = next;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // Storage may be disabled; the choice still holds for this page.
  }
  for (const watcher of localeWatchers) watcher(next);
}

function viewSession(id: string): ViewSessionStore {
  const existing = viewSessions.get(id);
  if (existing) {
    existing.touchedAt = Date.now();
    return existing;
  }
  const created = { adapter: new DshSnapshotAdapter(), journal: [], touchedAt: Date.now() };
  viewSessions.set(id, created);
  if (viewSessions.size > MAX_VIEW_SESSIONS) {
    const oldest = [...viewSessions.entries()].sort((left, right) => left[1].touchedAt - right[1].touchedAt)[0]?.[0];
    if (oldest && oldest !== id) viewSessions.delete(oldest);
  }
  return created;
}


function AgentLiveView({ sessionId, useSession, useConversation, useProjection, useSessions, useSessionStatus }: ConvViewProps) {
  const iframe = React.useRef<HTMLIFrameElement>(null);
  const ready = React.useRef(false);
  const [locale, setLocale] = React.useState<Locale>(activeLocale);
  const id = String(sessionId);
  const store = React.useMemo(() => viewSession(id), [id]);
  const running = useSession((snapshot: SessionSnapshot) => snapshot.running);
  const chat = useConversation((snapshot: ConversationSnapshot) => snapshot.views.get("chat"));
  const modelSelection = useProjection("modelSelection");
  const tokenUsage = useProjection("tokenUsage");
  const office = useProjection("agentLiveOffice");
  const childCatalog = useProjection("subagentCatalog") ?? [];
  const summaries = useSessions((snapshot: SessionListState) => snapshot.byId);
  const statuses = useSessionStatus((snapshot: SessionStatusSnapshot) => snapshot);
  const childActivity = new Map<string, boolean>();
  for (const [childId, status] of statuses) {
    if (typeof status.running === "boolean") childActivity.set(String(childId), status.running);
  }
  const model = modelSelection?.next ?? modelSelection?.lastUsed ?? undefined;
  const observation = React.useMemo(() => buildObservation({
    sessionId: id,
    running,
    chat,
    model,
    tokens: projectedTokenCount(tokenUsage),
    childCatalog,
    childActivity,
    summaries,
  }), [id, running, chat, model, tokenUsage, childCatalog, statuses, summaries]);

  React.useEffect(() => {
    store.touchedAt = Date.now();
    const events = store.adapter.update(observation);
    if (!events.length) return;
    store.journal.push(...events);
    if (store.journal.length > 800) store.journal.splice(1, store.journal.length - 800);
    if (!ready.current) return;
    for (const event of events) iframe.current?.contentWindow?.postMessage({ source: "agent-live-dsh", event }, "*");
  }, [observation, store]);

  React.useEffect(() => {
    localeWatchers.add(setLocale);
    setLocale(activeLocale);
    return () => {
      localeWatchers.delete(setLocale);
    };
  }, []);

  React.useEffect(() => {
    // A locale switch re-creates the frame, so the next deltas wait for its
    // handshake and are replayed from the journal with it.
    ready.current = false;
  }, [locale]);

  React.useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (message.source !== iframe.current?.contentWindow || message.data?.source !== "agent-live-dsh-frame") return;
      // A locale switch re-creates the frame below; the new frame asks for the
      // journal with its own handshake, so this message must not replay it here.
      if (message.data.type === "locale") {
        applyLocale(readLocale(message.data.locale));
        return;
      }
      ready.current = true;
      for (const event of store.journal) iframe.current?.contentWindow?.postMessage({ source: "agent-live-dsh", event }, "*");
    };
    window.addEventListener("message", receive);
    return () => {
      ready.current = false;
      window.removeEventListener("message", receive);
    };
  }, [id, store]);

	const document = React.useMemo(() => frameDocument(office?.content, locale), [office?.revision, locale]);
	return <iframe key={`${office?.revision ?? "default"}:${locale}`} ref={iframe} title="Agent Live" srcDoc={document} sandbox="allow-scripts" style={{ border: 0, display: "block", height: "100%", width: "100%" }} />;
}

/** Register one session-scoped DSH conversation view; DSH retains all controls. */
export function apply(ctx: Context): void {
  ctx.slots.inject("conversation.view", () => ctx.slots.register({ name: "conversation.view", id: "agent-live", order: 20, label: "Agent Live" }, AgentLiveView));
}
