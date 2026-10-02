import type { SessionListState } from "@deepseek-ai/dsh-api-session-controller/client";
import type { ConversationNode, RunningToolCall, ToolResultNode } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { ChatSnapshot } from "@deepseek-ai/dsh-client-ui-chat/client";
import type { DshChildRecord, DshMessageRecord, DshObservation, DshToolRecord } from "./adapter.ts";

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

export function projectedTokenCount(value: unknown): number | undefined {
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
  return { callId: call.callId, name: call.name, args: parseArgs(call.phase === "start" ? call.argsRaw : ""), at: call.time, running: true };
}

function completedTool(node: ToolResultNode): DshToolRecord {
  return { callId: node.callId, name: node.call?.name ?? "tool", args: parseArgs(node.call?.argsRaw ?? ""), at: node.time, running: false, ok: !node.isError };
}

export function buildObservation(input: {
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
