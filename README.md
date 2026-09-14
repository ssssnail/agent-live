# Agent Live

[![CI](https://github.com/ssssnail/agent-live/actions/workflows/ci.yml/badge.svg)](https://github.com/ssssnail/agent-live/actions/workflows/ci.yml)

Watch your coding agents work in a live pixel office.

Agent Live is a local-first visualization engine. Host adapters translate supported coding-agent events into a shared `OfficeEvent` protocol; the common engine turns those events into movement, work, collaboration and office life. No cloud backend is required.

```text
Coding Agent → Adapter → OfficeEvent → Agent Live Engine → Viewer
```

Official adapters currently cover Pi, Codex and DeepSeek Harness. The product ships three offices: `tech`, `meetingroom` and `oldschool`.

## Install

### Pi

```bash
pi install npm:agent-live-pi-adapter
```

Restart Pi and run `/agent-live`. Use `/agent-live custom` to enter Creator Mode and `/agent-live exit` to return to normal work. See [Using Agent Live with Pi](docs/USING-PI.md).

### Codex

```bash
codex plugin marketplace add ssssnail/agent-live --ref main
codex plugin add agent-live@agent-live-marketplace
```

Invoke the Agent Live Skill to open its local Codex client. Codex customization is an explicit single invocation. See [Using Agent Live with Codex](docs/USING-CODEX.md).

### DeepSeek Harness

```bash
dsh plugin --profile web add agent-live-dsh-adapter
dsh plugin --profile web install
dsh web
```

Open a session and switch to the `Agent Live` view. See [Using Agent Live with DSH](docs/USING-DSH.md).

## Develop

Requires Node.js 22 or newer.

```bash
npm ci
npm run check
npm run preview
```

The preview command prints the configurable V2 demo URL and the frozen original visual baseline. Before release, run:

```bash
npm run check:ci
```

## Architecture

- `plugins/agent-live/src/core` — shared protocol, state and work semantics.
- `plugins/agent-live/src/runtime` — local Viewer service and owned-resource cleanup.
- `plugins/agent-live/src/content` — Office Spec compiler, registry and validation.
- `plugins/agent-live/src/creator` — constrained natural-language customization tools.
- `plugins/agent-live/src/adapters/codex` — Codex App Server integration source.
- `plugins/agent-live/web/v2` — office engine, renderers and packaged content.
- `plugins/agent-live/dsh` — native DSH `conversation.view` source and npm package.
- `packages/pi` — isolated Pi npm distribution.
- `dist/codex-plugin` — generated self-contained Codex Marketplace distribution.
- `skills/agent-live-adapter-builder` — guided third-party adapter scaffolding.

Start with [Architecture](docs/ARCHITECTURE.md), [Developer Guide](docs/DEVELOPER.md), [Adapter SDK](docs/ADAPTER-SDK.md), or [Customization Boundaries](docs/CUSTOMIZATION.md).

## Packages

- `agent-live` — host-neutral engine, viewer, Creator and Adapter SDK.
- `agent-live-pi-adapter` — self-contained Pi extension.
- `agent-live-dsh-adapter` — native DSH View plugin.
- Codex installs from this repository's Marketplace and is not published to npm.

## Local data and safety

Agent Live binds its standalone service to `127.0.0.1`. Custom Offices and lightweight replay data stay on the user's machine. Adapters own their host-specific integration; Agent Live always cleans up the local services and temporary resources it creates itself.

## Inspiration

Agent Live was inspired by [ChatDev](https://github.com/OpenBMB/ChatDev). It began as a product manager's small vibe-coding experiment and grew into an exploration of how AI work, collaboration and organizations might become visible and understandable.

## License

[MIT](LICENSE)
