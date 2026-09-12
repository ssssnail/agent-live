const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
import { OfficeContentService } from "../plugins/agent-live/src/runtime/content-service.ts";
import { CreatorService } from "../plugins/agent-live/src/creator/service.ts";
import { AgentLiveRuntime } from "../plugins/agent-live/src/runtime/agent-live-runtime.ts";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-visual-"));
const content = await OfficeContentService.create({ dataRoot: root });
const creator = new CreatorService(content.registry, content.library);
const runtime = new AgentLiveRuntime(root, { dataRoot: root });
const server = await runtime.start({ port: 0, content, creatorToken: "visual-check" });
let browser;
try {
 browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
 const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
 const errors = [];
 page.on("pageerror", error => errors.push(error.message));
 for (const office of (await content.list()).filter(x => x.origin === "official")) {
  await page.goto("about:blank");
  await content.select(office.id);
  const result = await creator.customize({
   texts: { company: "Snail Lab", notice: "Today: focus on quality", slogan: "一起完成 / Build together" },
   placements: { upsert: [
    { id: "new-plant-a", component: "builtin/plant", slot: "extra-1" },
    { id: "new-plant-b", component: "builtin/plant", slot: "extra-2" },
    { id: "new-machine", component: "builtin/vending-machine", slot: "extra-3" }
   ] }, environmentOverrides: { clock: { mode: "fixed", fixedTime: "12:00" } }
  });
  assert.equal(result.saved, true, JSON.stringify(result.errors));
  await page.goto(server.url + "/v2.html?demo=1&token=visual-check");
  await page.waitForFunction(() => window.Office && document.querySelector("#conn")?.textContent !== "Configuration error");
  assert.equal(await page.evaluate(() => window.OfficeContent.preset.id), result.office.id);
  await page.screenshot({ path: root + "/" + office.name + ".png" });
 console.log(office.name + ": " + root + "/" + office.name + ".png");
 }
 const liveEdit = await creator.customize({ texts: { notice: "Live reload test" } });
 assert.equal(liveEdit.saved, true);
 await page.waitForFunction(() => window.OfficeContent?.layout?.textSlots?.some(slot => slot.id === "notice" && slot.text === "Live reload test"));
 await page.selectOption("#preset", "builtin/boardroom-office");
 await page.waitForFunction(() => window.OfficeContent?.preset?.id === "builtin/boardroom-office");
 assert.equal((await content.registry.selected()).name, "meetingroom");
 await page.goto(server.url + "/v2.html?token=visual-check");
 await page.waitForFunction(() => window.OfficeContent?.preset?.name === "meetingroom");
 if (process.env.CHECK_DSH_FRAME === "1") {
  // Exercise the actual bundled srcDoc, without starting DSH or a model.
  const framePath = path.join(root, "dsh-frame.html");
  await promisify(execFile)(process.execPath, ["build.mjs"], {
   cwd: path.resolve(import.meta.dirname, "../plugins/agent-live/dsh"),
   env: { ...process.env, AGENT_LIVE_DSH_FRAME_PREVIEW: framePath },
  });
  const changed = await creator.customize({ environmentOverrides: {
   clock: { mode: "fixed", fixedTime: "03:00" }, weather: { fallback: "rain" },
   npcSchedule: { defaultShift: { start: "00:00", end: "04:00" } }
  } });
  assert.equal(changed.saved, true);
  const graph = await content.resolve();
  const html = (await readFile(framePath, "utf8")).replace("__AGENT_LIVE_CONTENT_URI__", encodeURIComponent(JSON.stringify(graph)));
  const embedded = await browser.newPage();
  embedded.on("pageerror", error => errors.push(error.message));
  await embedded.setContent(html);
  await embedded.waitForFunction(() => window.OfficeEnvironment && window.Office);
  const environment = await embedded.evaluate(() => ({
   hour: window.OfficeEnvironment.snapshot().hour,
   weather: window.OfficeEnvironment.snapshot().weather,
   onDuty: window.OfficeEnvironment.isNpcOnDuty("colleague")
  }));
  assert.deepEqual(environment, { hour: 3, weather: "rain", onDuty: true });
  await embedded.close();
  console.log("browser: bundled DSH frame applies custom clock, weather and NPC schedule");
 }
 assert.deepEqual(errors, []);
 console.log("browser: three scenes, saved content, authenticated selection and reopen passed");
} finally { await browser?.close(); await runtime.close(); await rm(root, { recursive: true, force: true }); }
