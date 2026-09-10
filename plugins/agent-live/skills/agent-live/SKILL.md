---
name: agent-live
description: Open Agent Live, watch current Codex work in a lightweight local pixel office, or create a Custom Office from natural language. Use when the user asks for Agent Live, a live office, to watch the coding agent work, or `/agent-live custom`.
---

# Agent Live

Open one self-contained local Agent Live session backed by the Codex App Server.

## Normal mode

1. Resolve the plugin root from this skill's installed location; do not use a development-machine absolute path.
2. Run `node <PLUGIN_ROOT>/scripts/codex-client.ts --no-open` in a persistent terminal session. Allow local Codex state access and localhost binding when the host requests approval. The client must not open a second browser window itself.
3. The first initialization can take time. Continue polling the same terminal until it prints the authenticated `http://localhost:.../v2.html?...` URL or a clear error.
4. Open the returned URL in the Codex browser panel.
5. Tell the user they can enter Codex tasks in that page and that closing the page shuts down the local HTTP service, Codex App Server child, and lightweight client after the short reconnect grace period.

## Customization requests

Codex currently supports explicit single-turn customization through this Skill. When the invocation includes an office change, apply it in the same turn. Do not claim that Creator Mode remains injected into later ordinary Codex turns. There is no draft, preview, confirmation, save, undo, or discard interaction.

1. Start the lightweight client exactly as in Normal mode if it is not already running for this invocation, and retain its authenticated viewer URL and persistent terminal session.
2. Use `node <PLUGIN_ROOT>/scripts/creator-command.ts --url <AUTHENTICATED_URL> --json <COMMAND_JSON>` for internal operations.
3. Inspect `list_offices` and `list_components` when the available capabilities are not already known.
4. Call `customize` once with an optional base Office id and an Office Patch containing the requested changes. Metadata is filled internally. If base is omitted, the currently selected Office is modified.
5. The operation validates, saves, selects, and immediately activates the Office. If validation fails, the current Office remains unchanged.

Do not expose internal command names, component IDs, JSON schemas, or patches. Map every request into the registered schema and component library without interrupting for unsupported values. After applying the change, summarize in one place:

- defaults selected for omitted details;
- closest supported substitutions;
- ignored or rejected parts;
- requests that require source changes because they need new geometry, artwork, animation, behavior, or component families.

Agent identity is part of the Office template: use Agent Profile for the real Agent's display name, title, and supported appearance. Leave omitted identity fields to the host. Do not rewrite host-reported subagent identities.

## Rules

- Start a fresh local session for each invocation; do not scan for or attach to another App Server.
- If no browser viewer connects within 3 minutes, the client exits automatically instead of leaving an orphan service. This window includes a potentially slow first App Server startup and queued panel opening.
- Never replace the authenticated URL with a tokenless URL.
- Do not start a daemon, Hub, hook listener, remote server, or cloud backend.
- Creator operations are limited to the bundled command router. Never edit plugin source files, execute generated code, or write arbitrary paths to satisfy a Custom Office request.
- If startup or customization fails, report the actual error and clean up any process started by this invocation. Do not claim the Office changed.
