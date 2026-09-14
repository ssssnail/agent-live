---
name: agent-live-adapter-builder
description: Investigate a coding agent's official extension APIs and build or review an independent Agent Live adapter with evidence, event mapping, scaffolding, and contract tests. Use when adding Agent Live support to a new coding-agent host; do not use for editing Offices or presets.
---

# Agent Live Adapter Builder

Build adapters against the public `@iniesta8888/agent-live` package. Never import repository-internal files.

## Required gates

1. Locate official host documentation, SDK types, or public source. Record exact links, versions, event names, fields, and lifecycle behavior in `HOST-CAPABILITIES.md`.
2. If the evidence cannot establish a supported extension or event surface, stop with an analysis. Do not probe private storage, infer events from UI text, or generate a pretend adapter.
3. Map each authoritative host event to one `OfficeDelta` in `EVENT-MAPPING.md`. Mark missing capabilities unsupported; do not manufacture work facts for visual completeness.
4. Run `scripts/create-adapter.mjs` only after the evidence and mapping are clear. Then replace every generated TODO with host-specific code.
5. Test normal completion, failure, interruption/disconnect, stable IDs, duplicate delivery, missing optional fields, cleanup, and officially supported subagents or controls.

Read [references/investigation.md](references/investigation.md) while investigating. Read [references/review.md](references/review.md) before declaring the adapter complete or preparing an upstream contribution.

## Scaffold

~~~bash
node <SKILL_ROOT>/scripts/create-adapter.mjs --id <host-id> --name "<Host Name>" --output <directory>
~~~

The script refuses to overwrite a non-empty directory. The adapter remains an independent package unless the user explicitly asks to integrate it into the Agent Live repository.

## Completion report

Report verified capabilities, unsupported capabilities, tests run, real-host validation still required, and every assumption. Never describe a simulated test as real-host validation.
