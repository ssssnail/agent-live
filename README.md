# Agent Live

[![CI](https://github.com/ssssnail/agent-live/actions/workflows/ci.yml/badge.svg)](https://github.com/ssssnail/agent-live/actions/workflows/ci.yml)

**Give your coding agents a live pixel office.**

Agent Live turns agent activity into a small, living workplace: agents think, use tools, collaborate, take breaks and finish their work in real time.

## Why this project exists

Agent Live began as a product manager's vibe-coding project—a hands-on way to explore how people might understand and collaborate with AI in the future.

The pixel office is only one possible interface. The same foundation could become a visual work log, a documentary of how a task was completed, a social space for humans and agents, or even a game. This project is a small starting point for those questions, not a finished answer.

There will be rough edges. Feedback, ideas and contributions are welcome; hopefully we can explore and maintain it together.

## How it works

Agent Live runs locally. An adapter translates events from a supported coding agent into a shared office language, and the common engine renders them:

```text
Coding Agent → Adapter → OfficeEvent → Agent Live → Pixel Office
```

Official adapters are available for Pi, Codex and DeepSeek Harness. Three offices are included: `tech`, `meetingroom` and `oldschool`.

## Install and use

### Pi

```bash
pi install npm:@iniesta8888/agent-live-pi-adapter
```

Restart Pi, then run `/agent-live`. [Pi guide](docs/USING-PI.md)

### Codex

```bash
codex plugin marketplace add ssssnail/agent-live --ref v0.3.1
codex plugin add agent-live@agent-live-marketplace
```

Invoke the Agent Live Skill to open the local office. [Codex guide](docs/USING-CODEX.md)

### DeepSeek Harness

```bash
dsh plugin --profile web add @iniesta8888/agent-live-dsh-adapter
dsh plugin --profile web install
dsh web
```

Open a session and select the `Agent Live` view. [DeepSeek Harness guide](docs/USING-DSH.md)

## Choose or customize an office

Pi and DeepSeek Harness support these commands:

```text
/agent-live list presets
/agent-live preset tech
/agent-live custom
/agent-live exit
```

While in Creator Mode, describe the change naturally—for example: “Rename the office Pixel Studio and add two colleagues.” Codex supports the same kind of customization as an explicit Agent Live Skill request. Changes are validated, saved locally and applied immediately.

## Build with Agent Live

The host-neutral package [`@iniesta8888/agent-live`](https://www.npmjs.com/package/@iniesta8888/agent-live) provides the engine and Adapter SDK. To create another host adapter, start with the [Adapter SDK](docs/ADAPTER-SDK.md) or give the included Adapter Builder Skill to your coding agent.

Project documentation: [Architecture](docs/ARCHITECTURE.md) · [Developer Guide](docs/DEVELOPER.md) · [Customization](docs/CUSTOMIZATION.md)

## Local-first

Agent Live requires no cloud backend. Standalone viewers bind to `127.0.0.1`; custom offices and lightweight replay data remain on the user's machine. Agent Live cleans up the local services and temporary resources it creates.

## Inspiration and license

Inspired by [ChatDev](https://github.com/OpenBMB/ChatDev). Released under the [MIT License](LICENSE).
