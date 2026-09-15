import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DshSnapshotAdapter, type DshObservation } from "../dsh/src/adapter.ts";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dsh");
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const isFile = (file: string) => stat(file).then(value => value.isFile(), () => false);

const pkg = await json(path.join(pluginRoot, "package.json"));
const patch = await readFile(path.join(pluginRoot, "cordis.patch.yml"), "utf8");
const client = await readFile(path.join(pluginRoot, "src/client.tsx"), "utf8");
const buildScript = await readFile(path.join(pluginRoot, "build.mjs"), "utf8");
const creator = await readFile(path.join(pluginRoot, "src/creator.ts"), "utf8");
const renderer = await readFile(path.join(pluginRoot, "../web/app.js"), "utf8");
const officeRenderer = await readFile(path.join(pluginRoot, "../web/v2/office-renderer.js"), "utf8");
const frameRuntime = await readFile(path.join(pluginRoot, "src/frame-runtime.ts"), "utf8");
const frameHtml = await readFile(path.join(pluginRoot, "src/frame.html"), "utf8");

assert.equal(pkg.dsh.client.platform, "web");
assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
assert.equal(pkg.exports["./client"].default, "./lib/client.js");
assert.match(patch, new RegExp(`name: ['"]${pkg.name.replaceAll("/", "\\/")}['"]`), "DSH loader entry must import the complete npm package name");
assert.match(buildScript, new RegExp(`moduleId = ["']${pkg.name.replaceAll("/", "\\/")}["']`), "DSH browser module id must match the complete npm package name");
assert.match(buildScript, /cp\(new URL\("\.\.\/web\/v2\/content"[\s\S]*new URL\("\.\/lib\/content"/, "DSH package must copy runtime Office content into its own lib directory");
assert(pkg.files.includes("lib/content/**/*.json"), "DSH npm package must publish its bundled Office content");
assert.match(client, /slots\.inject\("conversation\.view"/);
assert.match(client, /useSession\(\(snapshot[^)]*\) => snapshot\.running\)/);
assert.match(client, /useConversation\(\(snapshot[^)]*\) => snapshot\.views\.get\("chat"\)\)/);
assert.match(client, /useProjection\("modelSelection"\)/);
assert.match(client, /useProjection\("subagentCatalog"\)/);
assert.match(client, /const viewSessions = new Map/);
assert.match(client, /viewSession\(id\)/);
assert.doesNotMatch(client, /AgentLiveRuntime|createServer|EventSource|WebSocket|child_process/);
assert.match(buildScript, /web\/style\.css/);
assert.match(buildScript, /web\/v2\/style\.css/);
assert.match(renderer, /new ResizeObserver\(scheduleResize\)/);
assert.match(renderer, /visibilitychange/);
assert.match(frameRuntime, /import chinese from .*zh-CN\.json/, "DSH view must bundle the Chinese locale");
assert.match(buildScript, /locale === "zh-CN"/, "the frame factory must resolve the host locale request");
assert.match(frameRuntime, /window\.AgentLiveInitialLocale === "zh-CN"/, "DSH view must boot in the locale the host chose");
assert.match(frameRuntime, /type: "locale", locale: next/, "switching language must ask the host for a frame in that locale");
assert.doesNotMatch(frameRuntime, /if \(latest\) for \(const listener of listeners\) listener\(latest\)/, "switching language must not re-project the snapshot the frame already applied");
assert.match(buildScript, /AGENT_LIVE_DSH_FRAME_MODULE/, "the host-side frame factory must be inspectable by tests");
assert.match(frameHtml, /id="language"/, "DSH view must expose the shared language control");
assert.match(officeRenderer, /const UI = content\.style\.tokens\.css/, "room signs must use the shared shell palette");
assert.match(officeRenderer, /slot\.id === "company"[\s\S]*UI\.accent[\s\S]*slot\.id === "slogan"[\s\S]*UI\.dim/, "room signs must preserve the shared UI hierarchy");
assert.match(renderer, /displayAgentName\(view, isLead\)/, "renderer must resolve fallback teammate names after Agent Profile overrides");
assert.match(client, /name: `Teammate \$\{index \+ 1\}`/, "DSH fallback child names must remain host-neutral");
assert.match(renderer, /if \(actor\.action\) hot\.add[\s\S]*retarget\(actor\)/, "snapshot agents without an action must leave the entrance");
assert.match(renderer, /goTo\(actor, Office\.TARGETS\.entry\);[\s\S]*if \(!actor\.path\.length\) \{[\s\S]*actors\.delete\(actor\.id\)/, "an agent already at the entrance must be removed immediately");
assert.match(creator, /CreatorModeRegistry/);
assert.match(creator, /input === "custom"/);
assert.match(creator, /input === "exit"/);
assert.match(creator, /input === "reset"/);
assert.match(creator, /input === "reset confirm"/);
assert.match(creator, /router\.execute\(\{ command: "reset" \}\)/, "confirmed DSH reset must use the shared Creator command");
assert.match(creator, /The plugin and built-in Presets remain installed/, "unconfirmed reset must explain what remains installed");
assert.match(creator, /input === "list preset" \|\| input === "list presets"/, "preset discovery must accept singular and plural commands");
assert.doesNotMatch(creator, /list layouts|startsWith\("layout "/, "an Office keeps its room: the layout surface must stay closed");
assert.match(creator, /rawInput = invocation\.rawInput\.trim\(\)\.replace/, "creator commands must normalize whitespace without destroying selector names");
assert.match(creator, /input = rawInput\.toLowerCase\(\)/, "creator command verbs must be case-insensitive");
assert.match(creator, /input\.startsWith\("preset "\)/, "preset discovery must have a selection command");
assert.match(creator, /commandOfficeProjections\.get\(String\(event\.data\.commandId\)\)/, "command selection must refresh the exact current session projection");
assert.match(creator, /commandOfficeProjections\.set\(String\(invocation\.commandId\), selectedOfficeProjection\)/, "selection handlers must publish their projection by command id");
assert.match(creator, /session\/disposed/, "Creator Mode must be released with its DSH session");
assert.match(creator, /currentOfficeProjection = selectedOfficeProjection/, "all DSH scopes must share the latest selected Office");
assert.match(creator, /Custom Offices:/, "preset discovery must distinguish custom Offices from preset Offices");
assert.match(creator, /systemPrompt\.context/);
assert.match(creator, /currently selected Office is authoritative/);
assert.match(creator, /default compact list_components summary at most once/);

const baseline: DshObservation = {
  sessionId: "session-a",
  running: false,
  turns: 2,
  model: "deepseek-chat",
  thinkingLevel: "low",
	tokens: 128,
  messages: [{ key: "user:1", kind: "user", text: "Inspect the adapter", at: 10 }],
  tools: [],
  children: [],
};
const adapter = new DshSnapshotAdapter(1000);
const first = adapter.update(baseline);
assert.equal(first.length, 1);
assert.equal(first[0]?.type, "snapshot");
if (first[0]?.type === "snapshot") {
  assert.equal(first[0].session.busy, false);
  assert.equal(first[0].session.model, "deepseek-chat");
  assert.equal(first[0].agents[0]?.id, "dsh:session-a");
  assert.equal(first[0].agents[0]?.task, "Inspect the adapter");
	assert.equal(first[0].agents[0]?.tokens, 128);
	assert.deepEqual(first[0].history.map((entry) => entry.event.type), ["task"]);
}
assert.deepEqual(adapter.update(baseline), [], "unchanged DSH snapshots must not duplicate events");

const working = adapter.update({
  ...baseline,
  running: true,
  turns: 3,
  messages: [...baseline.messages, { key: "user:2", kind: "user", text: "Run tests", at: 20 }],
  tools: [{ callId: "call-1", name: "bash", args: { command: "npm test" }, at: 21, running: true }],
  children: [{ id: "dsh:child-1", name: "Teammate 1", task: "Run focused tests", running: true }],
});
assert.equal(working.filter((event) => event.type === "task").length, 1);
assert.equal(working.filter((event) => event.type === "action").length, 1);
assert.equal(working.filter((event) => event.type === "agent_join").length, 1);
assert.equal(working.filter((event) => event.type === "delegate").length, 1);
assert.equal(working.find((event) => event.type === "delegate")?.task, "Run focused tests");

const completed = adapter.update({
  ...baseline,
  turns: 3,
  messages: [...baseline.messages, { key: "user:2", kind: "user", text: "Run tests", at: 20 }, { key: "assistant:3", kind: "assistant", text: "Tests passed", at: 30, tokens: 42 }],
  tools: [{ callId: "call-1", name: "bash", args: { command: "npm test" }, at: 21, running: false, ok: true }],
  children: [{ id: "dsh:child-1", name: "Teammate 1", task: "Run focused tests", running: false }],
});
assert.equal(completed.filter((event) => event.type === "action_end").length, 1);
assert.equal(completed.filter((event) => event.type === "say").length, 1);
assert.equal(completed.filter((event) => event.type === "usage").length, 0, "per-message usage must not overwrite the unchanged session total");
assert.equal(completed.filter((event) => event.type === "agent_leave").length, 1);
const finalObservation: DshObservation = {
  ...baseline,
  turns: 3,
  messages: [...baseline.messages, { key: "user:2", kind: "user", text: "Run tests", at: 20 }, { key: "assistant:3", kind: "assistant", text: "Tests passed", at: 30, tokens: 42 }],
  tools: [{ callId: "call-1", name: "bash", args: {}, at: 21, running: false, ok: true }],
  children: [],
};
assert.deepEqual(adapter.update(finalObservation), []);
assert.deepEqual(adapter.update(finalObservation).filter((event) => event.type === "action_end"), [], "completed DSH tools emitted duplicate action_end events");

const latestChild = [...Array.from({ length: 15 }, (_, i) => ({ id: `old-${i}`, name: "Old", running: false })), { id: "new", name: "New", running: true }];
assert.equal(adapter.update({ ...finalObservation, children: latestChild }).filter((e) => e.type === "agent_join").length, 1);
const childSnapshot = new DshSnapshotAdapter().update({ ...finalObservation, children: latestChild })[0];
assert(childSnapshot.type === "snapshot");
assert(childSnapshot.agents.some((a) => a.id === "new"));

const longSession: DshObservation = {
	...baseline,
	messages: Array.from({ length: 4100 }, (_, i) => ({ key: `long-${i}`, kind: "assistant", text: `Message ${i}`, at: i })),
	tools: Array.from({ length: 4100 }, (_, i) => ({ callId: `tool-${i}`, name: "read", args: {}, at: i, running: false })),
};
const longAdapter = new DshSnapshotAdapter();
const longSnapshot = longAdapter.update(longSession)[0];
assert(longSnapshot.type === "snapshot" && longSnapshot.history.length <= 4000, "restored history must also stay bounded");
assert.deepEqual(longAdapter.update(longSession), []);
longSession.messages = [...longSession.messages, { key: "latest", kind: "assistant", text: "Latest", at: 5000 }];
longSession.tools = [...longSession.tools, { callId: "latest-tool", name: "read", args: {}, at: 5000, running: false }];
assert.equal(longAdapter.update(longSession).length, 3, "only the new message and tool pair should be emitted");
assert.deepEqual(longAdapter.update(longSession), [], "bounded dedup must not replay old snapshots");
assert.match(frameRuntime, /createEnvironmentRuntime\(content\.environment\)/, "embedded frames must apply the selected Office environment");

const crowded = new DshSnapshotAdapter(3000).update({
	...baseline,
	children: Array.from({ length: 30 }, (_, index) => ({ id: `child-${index}`, name: `Child ${index}`, running: true })),
});
if (crowded[0]?.type === "snapshot") assert.equal(crowded[0].agents.length, 16, "DSH snapshot exceeded the shared agent limit");

const restored = new DshSnapshotAdapter(2000).update(finalObservation);
assert.equal(restored[0]?.type, "snapshot");
if (restored[0]?.type === "snapshot") {
	assert.deepEqual(
		restored[0].history.map((entry) => entry.event.type),
		["task", "task", "action", "action_end", "say"],
		"a remounted DSH view must recover replayable work from the host snapshot",
	);
	assert.equal(restored[0].history.every((entry, index, all) => index === 0 || entry.at >= all[index - 1].at), true);
}

for (const file of ["src/index.ts", "src/client.tsx", "build.mjs", "cordis.patch.yml"]) {
  assert.equal(await isFile(path.join(pluginRoot, file)), true, `missing DSH package file ${file}`);
}

assert.match(creator, /commands\.register/);
assert.match(creator, /skills\.register/);
assert.match(creator, /systemPrompt\.context/);
assert.match(creator, /tools\.register\(defineTool/);
assert.match(creator, /new CreatorCommandRouter/);
assert.match(creator, /sessionProjections\.register/);
assert.match(creator, /content: sessionEventContent\(await content\.resolve\(\)\)/, "DSH must initialize new sessions from the selected local Office");
assert.match(creator, /init: \(\) => currentOfficeProjection \?\? selectedOfficeProjection/, "new DSH sessions must inherit the selected local Office");
assert.match(creator, /selectedOfficeProjection = projection/, "successful customization must update the default for later DSH sessions");
assert.doesNotMatch(creator, /session\.append\("agent-live\/office"/);
assert.match(creator, /presentationMeta/);
assert.match(creator, /event\.type !== "tool\/result"/);
assert.match(creator, /enum: \["list_offices", "list_components", "customize"\]/);
assert.match(client, /useProjection\("agentLiveOffice"\)/);
assert.match(client, /frameDocument\(office\?\.content, locale\)/);
assert.match(client, /localStorage\.getItem\(LOCALE_STORAGE_KEY\)/, "the DSH language choice must survive a reload");
assert.match(client, /if \(message\.data\.type === "locale"\)[\s\S]*applyLocale\(readLocale\(message\.data\.locale\)\)/, "the host must adopt the locale the frame reports");
assert.doesNotMatch(client, /message\.data\?\.source !== "agent-live-dsh-frame"\) return;\n\s+ready\.current = true;\n\s+for \(const event of store\.journal\)/, "a locale message must not replay the journal it already applied");

console.log("dsh adapter: native view, snapshot diff, tools, answers and subagent lifecycle passed");
