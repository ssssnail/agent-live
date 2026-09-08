---
name: agent-live
description: Open Agent Live and show the current Codex work in a lightweight local pixel office. Use when the user asks for Agent Live, a live office, or to watch the coding agent work.
---

# Agent Live

Open one self-contained local Agent Live session backed by the Codex App Server.

## Start

1. Resolve the plugin root from this skill's installed location; do not use a development-machine absolute path.
2. Run `node <PLUGIN_ROOT>/scripts/codex-client.ts` in a persistent terminal session. Allow local Codex state access and localhost binding when the host requests approval.
3. The first initialization can take time. Continue polling the same terminal until it prints the authenticated `http://localhost:.../v2.html?...` URL or a clear error.
4. Open the returned URL in the Codex browser panel.
5. Tell the user they can enter Codex tasks in that page and that closing the page shuts down the local HTTP service, Codex App Server child, and lightweight client after the short reconnect grace period.

## Rules

- Start a fresh local session for each invocation; do not scan for or attach to another App Server.
- Never replace the authenticated URL with a tokenless URL.
- Do not start a daemon, Hub, hook listener, remote server, or cloud backend.
- Do not claim Creator or Custom Office support; those features are not implemented yet.
- If startup fails, report the actual error and clean up any process started by this invocation.
