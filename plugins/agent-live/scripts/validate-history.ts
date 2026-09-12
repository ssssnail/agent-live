#!/usr/bin/env node
import { OfficeState } from "../src/core/state.ts";
import assert from "node:assert/strict";

const state = new OfficeState("/tmp/agent-live-history-test");
state.join("main", { name: "Codex", role: "developer" });
const original = state.snapshot();
state.subscribe((event) => {
	if (event.type === "agent_join") event.agent.name = "consumer mutation";
});
state.setTask("main", "Inspect the project");
state.setState("main", "thinking", "Planning");
state.startAction("main", "tool-1", "archive", "Read README.md");
state.endAction("main", "tool-1", true);
state.setState("main", "idle", "Standing by");

const snapshot = state.snapshot();
if (snapshot.type !== "snapshot") throw new Error("Expected a snapshot");
if (snapshot.history.length < 6) throw new Error("History did not capture the full event stream");
for (let index = 1; index < snapshot.history.length; index++) {
	if (snapshot.history[index].at < snapshot.history[index - 1].at) throw new Error("History is not chronological");
}
if (state.snapshot(false).history.length !== 0) throw new Error("Lightweight live snapshot included replay history");
state.addUsage("main", 900, 0);
state.join("main", { name: "Renamed", role: "developer" });
assert.equal(original.agents[0].tokens, 0);
assert.equal(original.agents[0].name, "Codex");
assert.equal(state.getAgent("main")?.name, "Renamed");
const join = state.snapshot().history[0].event;
assert.equal(join.type, "agent_join");
if (join.type === "agent_join") {
	assert.equal(join.agent.name, "Codex");
	assert.equal(join.agent.state, "idle");
	assert.equal(join.agent.tokens, 0);
	join.agent.name = "snapshot mutation";
}
assert.equal(state.snapshot().history[0].event.type === "agent_join" && (state.snapshot().history[0].event as any).agent.name, "Codex");
console.log(`History validation passed: ${snapshot.history.length} replayable events`);
state.dispose();
