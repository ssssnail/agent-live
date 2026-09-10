# Contributing to Agent Live

Thanks for helping coding agents feel more legible and alive. Small, focused changes are easiest to review.

## Before opening a change

- Use Node.js 22 or newer and install with `npm ci`.
- Run `npm test` for the source regression suite.
- Run `npm run build` when changing exported TypeScript.
- Run `npm run check:ci` before a pull request when the DSH dependencies are available.
- Do not commit credentials, local session logs, generated caches, or user Custom Offices.

## Adapter contributions

Read [the Adapter SDK manual](docs/ADAPTER-SDK.md) and [the investigation guide](docs/ADAPTER-DEVELOPMENT.md). A new Adapter must cite the host's official public API, include an event mapping and automated tests, document unsupported capabilities, and record what still requires a real-host test.

You can also give the bundled [`agent-live-adapter-builder`](skills/agent-live-adapter-builder/SKILL.md) Skill to your coding agent. Its scaffold creates an independent package and does not modify Agent Live internals.

## Product and content contributions

Keep host facts, office behavior, and rendering separate. Adapters translate official host data into `OfficeEvent`; the Engine owns office state and local resources; content defines layouts, props, NPCs and activities. Do not add host-specific fields to the public event protocol.

Visual assets and copied code must have a compatible redistribution license. Describe any third-party source and license in the pull request.

## Pull request checklist

- Explain the user-visible behavior and scope.
- Add or update the smallest relevant automated test.
- State which real hosts and versions were tested.
- Note compatibility, privacy, resource, and migration implications.
- Keep unrelated formatting or generated-file churn out of the change.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues should follow [SECURITY.md](SECURITY.md), not public issue reports.
