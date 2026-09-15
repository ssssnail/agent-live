---
name: agent-live
description: Open Agent Live, watch current Codex work in a lightweight local pixel office, or create a Custom Office from natural language. Use when the user asks for Agent Live, a live office, to watch the coding agent work, or `/agent-live custom`.
---

# Agent Live

Open one self-contained local Agent Live session backed by the Codex App Server.

## Normal mode

1. Resolve the plugin root from this skill's installed location; do not use a development-machine absolute path.
2. Run `node <PLUGIN_ROOT>/scripts/codex-client.js --no-open` in a persistent terminal session. Allow local Codex state access and localhost binding when the host requests approval. The client must not open a second browser window itself.
3. The first initialization can take time. Continue polling the same terminal until it prints the authenticated `http://localhost:.../v2.html?...` URL or a clear error.
4. Open the returned URL in the Codex browser panel.
5. Tell the user they can enter Codex tasks in that page and that closing the page shuts down the local HTTP service, Codex App Server child, and lightweight client after the short reconnect grace period.

## Customization requests

Codex currently supports explicit single-turn customization through this Skill. When the invocation includes an office change, apply it in the same turn. Do not claim that Creator Mode remains injected into later ordinary Codex turns. There is no draft, preview, confirmation, save, undo, or discard interaction.

1. Start the lightweight client exactly as in Normal mode if it is not already running for this invocation, and retain its authenticated viewer URL and persistent terminal session.
2. Use `node <PLUGIN_ROOT>/scripts/creator-command.js --url <AUTHENTICATED_URL> --json <COMMAND_JSON>` for internal operations.
3. For common changes, call `customize` directly. Use `list_offices` or `list_components` only when a choice is unknown. `list_components` defaults to a compact summary; pass `category` as `room`, `npcs`, `props`, `activities`, `appearance`, or `environment` to request only what is needed. Use `all` only when the user explicitly asks for the complete capability catalog. The `room` category includes zones, placement slots, occupants, and NPC spawn points.
4. Start from the closest complete Preset Office. For a request like "make me a police station", pick the nearest Preset Office and change its name, people, identities, furniture, style and activities; the wording itself never creates a new room.
5. Call `customize` once with an optional base Office id and an Office Patch containing the requested changes. Metadata is filled internally. If base is omitted, the currently selected Office is modified. A patch can never change the room.
6. The operation validates, saves, selects, and immediately activates the Office. If validation fails, the current Office remains unchanged.

Do not expose internal command names, component IDs, JSON schemas, or patches. Map every request into the registered schema and component library without interrupting for unsupported values. After applying the change, summarize in one place:

- defaults selected for omitted details;
- closest supported substitutions;
- ignored or rejected parts;
- requests that require source changes because they need new geometry, artwork, animation, behavior, or component families. A brand-new room structure (new walls, areas, lanes, seats or work stations) belongs here: it needs a new Office Preset, so say that plainly.

Agent identity is part of the Office template: use Agent Profile for the real Agent's display name, title, and supported appearance. Leave omitted identity fields to the host. Do not rewrite host-reported subagent identities.

## Reset local data

- When the user invokes `/agent-live reset` without `confirm`, do not delete anything. Explain that it removes every Custom Office, the selected Office, and all other Agent Live local data while keeping the plugin and built-in Presets installed. Ask them to invoke `/agent-live reset confirm` to continue.
- Only for an explicit `/agent-live reset confirm`, start the lightweight client, then run `creator-command.ts` with `{ "command": "reset" }`.
- Report that the default `tech` Office is active and Agent Live remains usable. Never infer confirmation from ordinary language or perform reset as part of another request.

## Rules

- Start a fresh local session for each invocation; do not scan for or attach to another App Server.
- If no browser viewer connects within 3 minutes, the client exits automatically instead of leaving an orphan service. This window includes a potentially slow first App Server startup and queued panel opening.
- Never replace the authenticated URL with a tokenless URL.
- Do not start a daemon, Hub, hook listener, remote server, or cloud backend.
- Creator operations are limited to the bundled command router. Never edit plugin source files, execute generated code, or write arbitrary paths to satisfy a Custom Office request.
- If startup or customization fails, report the actual error and clean up any process started by this invocation. Do not claim the Office changed.
