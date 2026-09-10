# Changelog

## 0.3.0 — Unreleased

- Added the shared Component Library, Office Spec, Compiler, Validator, and local Custom Office registry.
- Added direct, atomic Creator changes: validation or save failure leaves the previous Office active, without preview, undo, confirmation, or draft state.
- Added session-scoped `/agent-live custom` and `/agent-live exit` modes for Pi and DSH; Codex retains explicit single-turn Skill customization because its plugin surface cannot persistently inject later ordinary turns.
- Rebuilt the three official offices on the shared content architecture while preserving the original demo baseline.
- Added shared scene capacity limits, reusable NPC templates, Agent Profile customization, activity recipes, and layout-specific implementations.
- Added in-memory history replay, English localization by default, and lifecycle cleanup when the local viewer closes.
- Added deterministic architecture, content, Creator, Adapter, Hook, package, and publish-contract validation.
- Added the native DeepSeek Harness `conversation.view` Adapter and its isolated lightweight renderer.
- Separated the host-neutral office navigation/environment engine from Canvas drawing.
- Added DSH clean-build and package validation to the root CI pipeline.
- Added GitHub Actions CI and tag-based GitHub Release workflows.
- Added a host-neutral Node entry, compiled public API, Adapter SDK, Adapter Builder Skill, offline consumer-package validation, and community contribution/security templates.
- Removed the legacy handwritten Adapter capability descriptors; tests now validate actual integrations and event behavior.

## 0.1.0 — 2026-09-07

First public beta.

- Live Pi session events rendered as a pixel office.
- Real-time thinking, speaking, tool activity, delegation, usage and status updates.
- Six built-in presets, including Old-School Office and Boardroom Office layouts.
- Local-only HTTP/SSE viewer with no hosted backend.
- `/agent-live`, `/agent-live demo`, `/agent-live status` and `/agent-live preset [id]` commands.
- Preset selection persisted in the browser.
