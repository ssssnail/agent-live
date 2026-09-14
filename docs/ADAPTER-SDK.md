# Agent Live Adapter SDK

This is the public development manual for connecting a coding-agent host to Agent Live. Use only exports from `@iniesta8888/agent-live` or `@iniesta8888/agent-live/adapter-sdk`; importing files under `plugins/agent-live/src` is unsupported.

Install the published SDK from npm:

~~~bash
npm install @iniesta8888/agent-live
~~~

## The minimum adapter

An adapter has one required job: subscribe to official host events and publish equivalent `OfficeDelta` events.

~~~ts
import { defineAdapter, type OfficeDelta } from "@iniesta8888/agent-live";

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

`connect()` may return a cleanup function or an object with `close()`. `connectAdapter()` only connects the adapter: it does not start a server, open a page, or wire controller methods to HTTP endpoints. The host entry point performs that composition and chooses when to close it. Agent Live cleans up the resources its Runtime owns when `runtime.close()` is called.

## Run a complete example

After `npm ci` and `npm run build` in this repository:

~~~bash
node examples/adapter/local-office.mjs
~~~

Open the printed local URL; Ctrl+C closes the example. [The example](../examples/adapter/local-office.mjs) imports only public `@iniesta8888/agent-live` exports, connects a simulated host, starts an authenticated Viewer, and exposes selection and Creator operations. Copy it into your independent adapter package and replace the host subscription. It does not invoke a model or register a host plugin for you.

`npm run validate:sdk-example` tests that consumer after a build, including selection, customization, reopening and cleanup in a temporary data directory. `check:ci` includes it.

## Reuse Creator

The public exports include `OfficeContentService`, `CreatorService`, `CreatorCommandRouter`, `CreatorModeRegistry`, `CREATOR_MODE_CONTEXT`, and the `OfficeSpec` / `OfficePatch` types.

Create content with `OfficeContentService.create()`, construct `CreatorService(content.registry, content.library)`, then `CreatorCommandRouter(service)`. Register `commands.execute()` as a host tool. Use `service.listOffices()` / `selectOffice(id)` for discovery and selection. The router supports `list_offices`, `list_components` and `customize`; valid changes apply immediately. Do not recreate validation or edit files yourself.

If the host supports scoped prompt hooks, register explicit `custom` / `exit` commands and use the mode registry/context during that host session. Otherwise use explicit single-invocation customization. Closing the integration must clear its Creator mode. Do not install hooks the host does not support.

## Optional host controls

Declare only methods backed by official host APIs:

~~~ts
interface ControllableHost extends Host {
  submit(text: string): Promise<unknown>;
  interrupt(): Promise<unknown>;
}

export function createControlledAdapter(host: ControllableHost) {
  return defineAdapter<ControllableHost>({
    id: "example",
    name: "Example Agent",
    connect({ host, office }) {
      return host.subscribe((event) => {
        const mapped = mapHostEvent(event);
        if (mapped) office.publish(mapped);
      });
    },
    controls: {
      prompt: (text) => host.submit(text),
      interrupt: () => host.interrupt(),
    },
  });
}
~~~

Capabilities are derived from implemented methods. Do not manually claim support. Subagents, model information, token usage and approval-waiting states are ordinary `OfficeDelta` data. Only responding to an approval is an optional control.

The launcher must explicitly route its UI or transport to these methods. The standalone server's `OfficeControls` type is also exported; do not assume declaring `controls` on a definition automatically creates a controller UI.

## Embedded views

Add `mountView(host)` only when the host provides a documented native view slot. Return its cleanup function. A host may embed the standalone Viewer URL, or supply its own native bundling/transport like DSH. This hook is a lifecycle callback, not a ready-made embedded renderer. The current runnable SDK example covers the standalone Viewer; a no-HTTP native view still needs host-specific integration. Do not fork the rendering logic.

## Evidence before code

Before implementation, record the official extension mechanism and versions, event names and fields, stable identities, delivery semantics, optional controls, native view APIs, missing capabilities and degradation. Do not infer private events from UI text, scan undocumented storage, or parse prose to invent tool or subagent state.

## Validation

Test main-agent lifecycle, paired tool calls, duplicate and missing data, disconnect and idempotent cleanup, officially exposed subagents, and every optional control. Run:

~~~bash
npm run validate:adapter-sdk
npm run check
~~~

For guided development, use the bundled `agent-live-adapter-builder` skill. It creates an independent package, capability report, event map and test skeleton without modifying Agent Live internals.
