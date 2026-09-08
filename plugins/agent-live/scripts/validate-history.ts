#!/usr/bin/env node
import { OfficeState } from "../src/core/state.ts";

const state = new OfficeState("/tmp/agent-live-history-test");
state.join("main", { name: "Codex", role: "developer" });
state.setTask("main", "Inspect the project");
state.setState("main", "thinking", "Planning");
state.startAction("main", "tool-1", "archive", "Read README.md");
state.endAction("main", "tool-1", true);
state.setState("main", "idle", "Standing by");

const snapshot = state.snapshot();
if (snapshot.type !== "snapshot") throw new Error("Expected a snapshot");
if (snapshot.history.length < 6) throw new Error("History did not capture the full event stream");
if (snapshot.history.some((entry) => entry.event.type === "snapshot")) throw new Error("History must not contain recursive snapshots");
for (let index = 1; index < snapshot.history.length; index++) {
	if (snapshot.history[index].at < snapshot.history[index - 1].at) throw new Error("History is not chronological");
}
console.log(`History validation passed: ${snapshot.history.length} replayable events`);
state.dispose();
