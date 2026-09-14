# Agent Live for DeepSeek Harness

Native, session-scoped Agent Live view for DeepSeek Harness `0.1.5-rc.1`.

The package registers an `Agent Live` entry in DSH's `conversation.view` slot.
It observes DSH's public Session, Conversation, model-selection and subagent
projections, maps them to `OfficeEvent`, and renders the standard Tech Open
Office inside the View. It does not start an Agent Live HTTP server, SSE
connection, subprocess, or controller.

DSH remains responsible for prompts, stop, model selection and approvals. The
View observes the current Session only. Unmounting the View destroys its
sandboxed render document, animation loop and in-memory event journal.

## Install

```bash
dsh plugin --profile web add @iniesta8888/agent-live-dsh-adapter
dsh plugin --profile web install
dsh web
```

Open a session, then select the `Agent Live` conversation view.

## Development

```bash
npm install
npm run check
dsh plugin --profile web add ./plugins/agent-live/dsh
```

The published package contains DSH's required lazy-CJS `lib/client.js` bundle.
