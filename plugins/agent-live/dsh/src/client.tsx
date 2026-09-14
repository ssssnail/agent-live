import type { Context } from "@deepseek-ai/cordis";
import type { SessionListState, SessionSnapshot } from "@deepseek-ai/dsh-api-session-controller/client";
import type { ConversationNode, ConversationSnapshot, ConvViewProps, RunningToolCall, ToolResultNode } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-session/client";
import type {} from "@deepseek-ai/dsh-subagent/client";
import React from "react";
import frameDocument from "agent-live-frame-document";
import type {} from "./creator.ts";
import { DshSnapshotAdapter, type DshChildRecord, type DshMessageRecord, type DshObservation, type DshToolRecord } from "../../src/adapters/dsh/adapter.ts";
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

function textContent(blocks: readonly unknown[]): string {
  return blocks.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const value = block as { type?: string; kind?: string; text?: unknown };
    return (value.type === "text" || value.kind === "text") && typeof value.text === "string" ? [value.text] : [];
  }).join("\n").trim();
}

function tokenCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  for (const key of ["totalTokens", "total_tokens", "total"]) {
    const count = Number(usage[key]);
    if (Number.isFinite(count) && count > 0) return count;
  }
  const input = Number(usage.inputTokens ?? usage.input_tokens ?? 0);
  const output = Number(usage.outputTokens ?? usage.output_tokens ?? 0);
  return input + output > 0 ? input + output : undefined;
}

function projectedTokenCount(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const total = Number(usage.uncachedInputTokens ?? 0) + Number(usage.outputTokens ?? 0) +
    Number(usage.cacheReadTokens ?? 0) + Number(usage.cacheWriteTokens ?? 0);
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

function messageTokenCount(messages: readonly DshMessageRecord[]): number | undefined {
  const total = messages.reduce((sum, message) => sum + Math.max(0, message.tokens ?? 0), 0);
  return total > 0 ? total : undefined;
}

function messageRecord(node: ConversationNode): DshMessageRecord | null {
  if (node.kind === "user") return { key: `user:${node.seq}`, kind: "user", text: textContent(node.content), at: node.time };
  if (node.kind === "assistant") {
    const tokens = tokenCount(node.usage);
    return { key: `assistant:${node.seq}`, kind: "assistant", text: textContent(node.blocks), at: node.time, ...(tokens ? { tokens } : {}) };
  }
  if (node.kind === "turn-error") return { key: `turn-error:${node.seq}`, kind: "turn-error", text: node.message, at: node.time };
  return null;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return raw ? { args: raw.slice(0, 200) } : {};
  }
}

function runningTool(call: RunningToolCall): DshToolRecord {
  return { callId: call.callId, name: call.name, args: parseArgs(call.argsRaw), at: call.time, running: true };
}

function completedTool(node: ToolResultNode): DshToolRecord {
  return { callId: node.callId, name: node.call?.name ?? "tool", args: parseArgs(node.call?.argsRaw ?? ""), at: node.time, running: false, ok: !node.isError };
}

function buildObservation(input: {
  sessionId: string;
  running: boolean;
  chat?: ChatSnapshot;
  model?: { model: string; reasoningEffort?: string } | null;
  tokens?: number;
  childCatalog: readonly { id: unknown; label?: string }[];
  childActivity: ReadonlyMap<string, boolean>;
  summaries: SessionListState["byId"];
}): DshObservation {
  const nodes = input.chat?.legacy.nodes ?? [];
  const messages = nodes.map(messageRecord).filter((item): item is DshMessageRecord => item !== null);
  const completed = nodes.filter((node): node is ToolResultNode => node.kind === "tool-result").map(completedTool);
  const running = (input.chat?.legacy.runningCalls ?? []).map(runningTool);
  const runningIds = new Set(running.map((tool) => tool.callId));
  const children: DshChildRecord[] = input.childCatalog.map((child, index) => {
    const id = String(child.id);
    const summary = input.summaries[child.id as keyof typeof input.summaries];
    const task = child.label || summary?.displayTitle || undefined;
    return {
      id: `dsh:${id}`,
      name: `Teammate ${index + 1}`,
      ...(task ? { task } : {}),
      // A stopped parent turn cannot retain a live child in the office even if
      // a lazily refreshed catalog still carries its previous activity bit.
      running: input.running && (input.childActivity.get(id) ?? summary?.running === true),
    };
  });
  return {
    sessionId: input.sessionId,
    running: input.running,
    turns: input.chat?.timeline.turnOrder.length ?? 0,
    ...(input.model?.model ? { model: input.model.model } : {}),
    ...(input.model?.reasoningEffort ? { thinkingLevel: input.model.reasoningEffort } : {}),
    ...(input.tokens ?? messageTokenCount(messages) ? { tokens: input.tokens ?? messageTokenCount(messages) } : {}),
    messages,
    tools: [...completed.filter((tool) => !runningIds.has(tool.callId)), ...running],
    children,
  };
}

function AgentLiveView({ sessionId, useSession, useConversation, useProjection, useSessions }: ConvViewProps) {
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
  const catalog = useSessions((snapshot: SessionListState) => snapshot.subagentsByParent[sessionId]);
  const childActivity = new Map<string, boolean>();
  for (const entry of catalog?.entries ?? []) {
    if (entry.kind === "child") childActivity.set(String(entry.id), entry.activity === "running");
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
  }), [id, running, chat, model, tokenUsage, childCatalog, catalog, summaries]);

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
