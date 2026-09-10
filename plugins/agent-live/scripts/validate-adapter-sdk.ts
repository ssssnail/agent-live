import assert from "node:assert/strict";
import { OfficeState } from "../src/core/state.ts";
import { adapterCapabilities, connectAdapter, createOfficeEventPublisher, defineAdapter } from "../src/adapter-sdk/index.ts";

const state = new OfficeState("/tmp/example");
const events = createOfficeEventPublisher(state);
let subscribed = false;
let cleaned = 0;
const adapter = defineAdapter({
	id: "example",
	name: "Example",
	controls: { async interrupt() {} },
	connect({ office }) {
		subscribed = true;
		office.publish({ type: "agent_join", agent: { id: "main", name: "Example", role: "Agent", state: "idle", tokens: 0, cost: 0, toolCalls: 0, joinedAt: Date.now() } });
		return () => { cleaned += 1; };
	},
});
assert.deepEqual(adapterCapabilities(adapter), { observe: true, prompt: false, interrupt: true, approve: false, modelSelect: false, embeddedView: false });
const connected = await connectAdapter(adapter, { host: {}, office: events });
assert.equal(subscribed, true);
assert.equal(state.getAgent("main")?.name, "Example");
await connected.close();
await connected.close();
assert.equal(cleaned, 1, "adapter cleanup was not idempotent");
assert.throws(() => defineAdapter({ id: "Bad ID", name: "Bad", connect() {} }), /adapter id/);
state.dispose();
console.log("adapter sdk: definition, inferred capabilities, event boundary and idempotent cleanup passed");
