import type { Context } from "@deepseek-ai/cordis";
import type { CommandInvocation } from "@deepseek-ai/dsh-commands";
import type {} from "@deepseek-ai/dsh-skill";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-session-projection";
import type {} from "@deepseek-ai/dsh-session";
import { z } from "zod";
import { CreatorCommandRouter } from "../../src/creator/commands.ts";
import { CreatorService } from "../../src/creator/service.ts";
import { CreatorModeRegistry, CREATOR_MODE_CONTEXT } from "../../src/creator/mode.ts";
import { OfficeContentService } from "../../src/runtime/content-service.ts";

type CreatorOperation = "list_offices" | "list_components" | "customize";

export interface AgentLiveOfficeProjection {
  revision: number;
  content: unknown;
}

// DSH shares the first projection definition registered for a key across
// agent-preset scopes. Command handlers may belong to a later scope, so hand
// the live command result to that shared projection by DSH's unique command id.
const commandOfficeProjections = new Map<string, AgentLiveOfficeProjection>();
let currentOfficeProjection: AgentLiveOfficeProjection | null = null;

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionStateMap { agentLiveOffice: AgentLiveOfficeProjection | null; }
  interface SessionProjectionMap { agentLiveOffice: AgentLiveOfficeProjection | null; }
}

/**
 * DSH persists session events and therefore accepts strict JSON values only.
 * Runtime content is assembled for an in-memory/browser boundary and may carry
 * harmless `undefined` properties, so normalize it before crossing into DSH.
 */
function sessionEventContent(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function officeProjection(value: unknown): AgentLiveOfficeProjection | null {
  if (!value || typeof value !== "object") return null;
  const projection = (value as { officeProjection?: unknown }).officeProjection;
  if (!projection || typeof projection !== "object") return null;
  const candidate = projection as { revision?: unknown; content?: unknown };
  return typeof candidate.revision === "number" && "content" in candidate
    ? { revision: candidate.revision, content: candidate.content }
    : null;
}

function modelResult(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { officeProjection: _officeProjection, ...visible } = value as Record<string, unknown>;
  return visible;
}

const SKILL = `# Agent Live Creator

Use the agent_live_creator tool when Agent Live Creator Mode is active. The user enters with /agent-live custom and exits with /agent-live exit. There is no draft, preview, confirmation, save, undo, or discard step; every valid customization applies atomically.

Inspect list_offices and list_components when the available choices are not already known, then call customize once. Omit base to modify the currently selected Office, or provide an Office id to start from that Office. Customize validates, saves, selects, and immediately displays the result.

Never expose internal component ids, schemas, or patches unless the user explicitly asks for implementation details. Map unsupported input to the closest supported capability without interrupting generation, then summarize defaults, substitutions, ignored requests, and source-code-only requests after applying the change.

An Office keeps its room. Map a request like "make me a police station" onto the closest complete Preset Office, then change its name, people, identities, furniture, style and activities. A brand-new room structure needs a new Office Preset, which is a source change — say so instead of swapping a room in place.

The public commands are exactly: /agent-live list presets, /agent-live preset <number or name>, /agent-live custom, /agent-live exit.`;

function commandPayload(operation: CreatorOperation, args: Record<string, unknown>) {
  switch (operation) {
    case "list_offices":
    case "list_components": return { command: operation };
    case "customize": return { command: operation, ...(args.base ? { base: args.base } : {}), patch: args.patch };
  }
}

export async function registerCreator(ctx: Context): Promise<void> {
  const content = await OfficeContentService.create();
  const service = new CreatorService(content.registry, content.library);
  const router = new CreatorCommandRouter(service);
  const modes = new CreatorModeRegistry();
  let selectedOfficeProjection: AgentLiveOfficeProjection = {
    revision: Date.now(),
    content: sessionEventContent(await content.resolve()),
  };
  currentOfficeProjection = selectedOfficeProjection;

  ctx.on("session/disposed", (session) => {
    modes.exit(String(session.id));
  });

  ctx.systemPrompt.context({
    name: "agent-live-creator-mode",
    order: ctx.systemPrompt.getContextOrder("SUBAGENT_DELEGATION") + 10,
    text: (assembly) => assembly.agent && modes.isActive(String(assembly.agent.id)) ? CREATOR_MODE_CONTEXT : "",
  });

  const officeProjectionSchema = z.unknown() as never;
  ctx.sessionProjections.register({
    key: "agentLiveOffice",
    stateSchema: officeProjectionSchema,
    init: () => currentOfficeProjection ?? selectedOfficeProjection,
    apply: (state, event) => {
      if (event.type === "command/done") {
        const next = commandOfficeProjections.get(String(event.data.commandId));
        if (!next) return state;
        commandOfficeProjections.delete(String(event.data.commandId));
        return next;
      }
      if (event.type !== "tool/result") return state;
      const meta = event.data.meta;
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) return state;
      const next = (meta as Record<string, unknown>).agentLiveOffice;
      return next && typeof next === "object" ? next as AgentLiveOfficeProjection : state;
    },
    wire: { viewSchema: officeProjectionSchema, view: (state) => state },
    stateVersion: 3,
  });

  ctx.skills.register({
    name: "agent-live-creator",
    description: "Create or modify a local Agent Live office from natural language.",
    whenToUse: "Use for Agent Live office customization, presets, NPCs, furniture, visual style, environment, schedules, or agent identity.",
    content: SKILL,
    source: "bundled",
  });

  ctx.commands.register({
    name: "agent-live",
    description: "Enter or exit Creator Mode, or inspect available Offices.",
    input: { hint: "custom | exit | list presets | preset <number/name>" },
    async handler(invocation: CommandInvocation) {
      const rawInput = invocation.rawInput.trim().replace(/\s+/g, " ");
      const input = rawInput.toLowerCase();
      const sessionId = String(invocation.agent.id);
      if (input === "custom") {
        modes.enter(sessionId);
        return { kind: "success", text: "Creator Mode is active. Describe an office change, or use /agent-live exit to leave." };
      }
      if (input === "exit") {
        return { kind: "success", text: modes.exit(sessionId) ? "Creator Mode exited." : "Creator Mode was not active." };
      }
      if (input === "list preset" || input === "list presets") {
        const offices = await service.listOffices();
        const lines = offices.map((office, index) => `${index + 1}. ${office.name}${office.selected ? " (selected)" : ""}`);
        const officialCount = offices.filter((office) => office.origin === "official").length;
        lines.splice(officialCount, 0, ...(officialCount < offices.length ? ["", "Custom Offices:"] : []));
        lines.unshift("Preset Offices:");
        return { kind: "success", text: lines.join("\n") + "\n\nSelect with /agent-live preset <number or name>, then edit it with /agent-live custom." };
      }
      if (input.startsWith("preset ")) {
        const selector = rawInput.slice(rawInput.indexOf(" ") + 1).trim();
        const offices = await service.listOffices();
        const index = /^\d+$/.test(selector) ? Number(selector) - 1 : -1;
        const office = index >= 0 ? offices[index] : offices.find((entry) => entry.id.toLowerCase() === selector.toLowerCase() || entry.name.toLowerCase() === selector.toLowerCase());
        if (!office) return { kind: "error", text: `Unknown preset "${selector}". Use /agent-live list presets to see the available choices.` };
        const result = await service.selectOffice(office.id);
        if (!result.selected) return { kind: "error", text: result.error };
        selectedOfficeProjection = { revision: Date.now(), content: sessionEventContent(await content.resolve(office.id)) };
        currentOfficeProjection = selectedOfficeProjection;
        commandOfficeProjections.set(String(invocation.commandId), selectedOfficeProjection);
        modes.exit(sessionId);
        return { kind: "success", text: `Selected ${office.name}. Agent Live has updated.` };
      }
      if (input) return { kind: "error", text: "Use /agent-live custom, /agent-live exit, /agent-live list presets, or /agent-live preset <number or name>." };
      return { kind: "success", text: modes.isActive(sessionId) ? "Creator Mode is active. Use /agent-live exit to leave." : "Use /agent-live custom to start editing the office." };
    },
  });

  ctx.tools.register(defineTool({
    name: "agent_live_creator",
    description: "Inspect capabilities or directly validate, save, select, and display an Agent Live office customization.",
    parameters: {
      operation: { type: "string", required: true, enum: ["list_offices", "list_components", "customize"] },
      base: { type: "string", description: "Optional Office id to use as the base; defaults to the selected Office." },
      patch: { type: "json", description: "Requested changes expressed with the bounded Office Patch fields; metadata is filled internally." },
    },
    output: {
      schema: { type: "json" },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(modelResult(value)) }],
      presentationMeta: (_args, value) => {
        const projection = officeProjection(value);
        return projection ? { agentLiveOffice: projection } as never : {};
      },
    },
    async execute(args, exec) {
      const result = await router.execute(commandPayload(args.operation, args));
      let projection: AgentLiveOfficeProjection | null = null;
      if (result.ok && args.operation === "customize") {
        const customized = result.data as { office?: { id?: string } };
        if (customized.office?.id) {
          projection = { revision: Date.now(), content: sessionEventContent(await content.resolve(customized.office.id)) };
          selectedOfficeProjection = projection;
          currentOfficeProjection = projection;
        }
      }
      return {
        ...result,
        ...(projection ? { officeProjection: projection } : {}),
      } as never;
    },
  }));
}
