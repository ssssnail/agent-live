import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadComponentLibrary, loadOfficialOffices } from "../src/content/library.ts";
import { OfficeRegistry } from "../src/content/registry.ts";
import { CreatorService } from "../src/creator/service.ts";

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/v2/content");
const root = await mkdtemp(path.join(os.tmpdir(), "agent-live-creator-"));
try {
	const library = await loadComponentLibrary(contentRoot);
	const registry = new OfficeRegistry({ root, library, officialOffices: await loadOfficialOffices(contentRoot) });
	const creator = new CreatorService(registry, library);
	assert.equal((await creator.listOffices()).filter((entry) => entry.origin === "official").length, 3);
	const changed = await creator.customize({ id: "local/natural-test", name: "Natural Test", npcs: { upsert: [{ id: "sam" }] }, activities: { enable: ["builtin/phone-break"] } });
	assert.equal(changed.saved, true);
	assert.equal(changed.office?.npcs.some((npc) => npc.id === "sam" && npc.profile), true);
	assert.equal((await registry.selected()).id, "local/natural-test");
	const snapshot = await registry.selected();
	const invalid = await creator.customize({ components: { layout: "builtin/missing" } });
	assert.equal(invalid.saved, false);
	assert.deepEqual(await registry.selected(), snapshot);
	const firstLayoutOffice = await creator.createFromLayout("builtin/demo-office", "Custom Demo Office");
	const secondLayoutOffice = await creator.createFromLayout("builtin/demo-office", "Custom Demo Office");
	assert.equal(firstLayoutOffice.saved, true);
	assert.equal(secondLayoutOffice.saved, true);
	assert.equal(firstLayoutOffice.office?.id, "local/layout-demo-office");
	assert.equal(secondLayoutOffice.office?.id, firstLayoutOffice.office?.id, "selecting one Layout repeatedly must reuse its working Office");
	assert.equal((await creator.listOffices()).filter((entry) => entry.id === "local/layout-demo-office").length, 1);
	console.log("creator service: direct save/select, defaults and failed-change isolation passed");
} finally { await rm(root, { recursive: true, force: true }); }
