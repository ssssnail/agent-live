# Agent Live Adapter SDK

This is the public development manual for connecting a coding-agent host to Agent Live. Use only exports from `agent-live` or `agent-live/adapter-sdk`; importing files under `plugins/agent-live/src` is unsupported.

Until an npm-registry release is available, install the SDK directly from GitHub:

~~~bash
npm install agent-live@github:ssssnail/agent-live#main
~~~

## The minimum adapter

An adapter has one required job: subscribe to official host events and publish equivalent `OfficeDelta` events.

~~~ts
import { defineAdapter, type OfficeDelta } from "agent-live";

interface Host {
  subscribe(listener: (event: unknown) => void): () => void;
}

function mapHostEvent(event: unknown): OfficeDelta | undefined {
  // Map documented host data. Return undefined when no reliable mapping exists.
}

export default defineAdapter<Host>({
  id: "example",
  name: "Example Agent",
  connect({ host, office }) {
    return host.subscribe((event) => {
      const mapped = mapHostEvent(event);
      if (mapped) office.publish(mapped);
    });
  },
});
~~~

`connect()` may return a cleanup function or an object with `close()`. Cleanup releases only resources created by the adapter; Agent Live cleans up its own state, viewer, local service and temporary data.

## Optional host controls

Declare only methods backed by official host APIs:

~~~ts
export default defineAdapter({
  id: "example",
  name: "Example Agent",
  connect,
  controls: {
    prompt: (text) => host.submit(text),
    interrupt: () => host.interrupt(),
  },
});
~~~

Capabilities are derived from implemented methods. Do not manually claim support. Subagents, model information, token usage and approval-waiting states are ordinary `OfficeDelta` data. Only responding to an approval is an optional control.

## Embedded views

Agent Live uses its local viewer by default. Add `mountView(host)` only when the host provides a documented native view slot. Return its cleanup function. Do not copy or modify the renderer.

## Evidence before code

Before implementation, record the official extension mechanism and versions, event names and fields, stable identities, delivery semantics, optional controls, native view APIs, missing capabilities and degradation. Do not infer private events from UI text, scan undocumented storage, or parse prose to invent tool or subagent state.

## Validation

Test main-agent lifecycle, paired tool calls, duplicate and missing data, disconnect and idempotent cleanup, officially exposed subagents, and every optional control. Run:

~~~bash
npm run validate:adapter-sdk
npm run check
~~~

For guided development, use the bundled `agent-live-adapter-builder` skill. It creates an independent package, capability report, event map and test skeleton without modifying Agent Live internals.
