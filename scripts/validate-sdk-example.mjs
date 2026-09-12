import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startExample } from "../examples/adapter/local-office.mjs";

const dataRoot = await mkdtemp(path.join(os.tmpdir(), "agent-live-sdk-example-"));
let cleanupCount = 0;
const host = { subscribe(publish) {
  publish({ type: "agent_join", agent: { id: "main", name: "Example", role: "Agent", state: "idle", tokens: 0, cost: 0, toolCalls: 0, joinedAt: Date.now() } });
  return () => { cleanupCount += 1; };
} };
let office;
try {
  office = await startExample({ host, dataRoot });
  const url = new URL(office.url);
  const headers = { "x-agent-live-token": url.searchParams.get("token") };
  const endpoint = (pathname) => new URL(pathname, url.origin);
  const snapshot = await (await fetch(endpoint("/api/state"), { headers })).json();
  assert.equal(snapshot.agents[0].name, "Example");
  assert.equal((await fetch(office.url)).status, 200);
  const offices = await office.creator.listOffices();
  assert.equal((await office.creator.selectOffice(offices[1].id)).selected, true);
  const changed = await office.commands.execute({ command: "customize", patch: { texts: { company: "SDK Test" } } });
  assert.equal(changed.ok, true);
  const graph = await (await fetch(endpoint("/api/office-content"), { headers })).json();
  assert(graph.layout.textSlots.some((slot) => slot.id === "company" && slot.text === "SDK Test"));
  await office.close();
  await office.close();
  assert.equal(cleanupCount, 1);
  await assert.rejects(fetch(endpoint("/api/state"), { headers }));
  office = await startExample({ host, dataRoot });
  assert((await office.creator.listOffices()).some((entry) => entry.origin === "custom" && entry.selected));
  console.log("SDK consumer: public exports, viewer, selection, customization, persistence and cleanup passed");
} finally {
  await office?.close();
  await rm(dataRoot, { recursive: true, force: true });
}
