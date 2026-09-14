import { AgentRegistry } from "../src/core/agents.ts";
import { SCENE_LIMITS, withinSceneLimit } from "../src/core/limits.ts";
import { OfficeState } from "../src/core/state.ts";

const state = new OfficeState("/tmp/agent-live-agent-registry-test");
const agents = new AgentRegistry(state, { leaveDelayMs: 0 });
agents.join("main", { name: "Main", role: "developer" });

for (let index = 1; index < SCENE_LIMITS.agents; index += 1) {
	const child = agents.spawn({ id: `child-${index}`, name: `worker-${index}`, task: `task-${index}` });
	if (!child) throw new Error(`Agent ${index} should fit within the scene limit`);
	if (index < SCENE_LIMITS.seats && child.seat !== index) throw new Error(`Agent ${index} received the wrong seat`);
	if (index >= SCENE_LIMITS.seats && child.seat !== undefined) throw new Error(`Overflow agent ${index} should stand`);
}

if (agents.spawn({ id: "overflow", name: "overflow", task: "overflow" })) {
	throw new Error("Agent count should stop at the hard scene limit");
}
if (agents.activeChildren() !== SCENE_LIMITS.agents - 1) throw new Error("Active child count is incorrect");
if (state.getAgent("main")?.state !== "waiting") throw new Error("Main agent should wait while children are active");
if (!withinSceneLimit("npcs", SCENE_LIMITS.npcs) || withinSceneLimit("npcs", SCENE_LIMITS.npcs + 1)) {
	throw new Error("Scene limit helper is incorrect");
}

agents.settleChildren(true);
if (agents.activeChildren() !== 0) throw new Error("All children should settle together");
const settling = agents.spawn({ id: "child-1", name: "late-event", task: "must not revive" });
if (settling?.name !== "worker-1" || !agents.isSettling("child-1")) {
	throw new Error("A late host event revived a terminal child");
}
await new Promise((resolve) => setTimeout(resolve, 5));
if (state.snapshot().agents.length !== 1) throw new Error("Settled children should leave the office");
agents.dispose();

console.log("Agent registry validation passed: lifecycle, independent seats, and hard limits");
