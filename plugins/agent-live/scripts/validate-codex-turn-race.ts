#!/usr/bin/env node
/**
 * Regression guard for the Codex turn-registration race.
 *
 * A turn can start and complete before `prompt()` reads its `turn/start`
 * response. Registering that finished turn afterwards used to leave the session
 * busy forever: every later event was ignored and the office kept showing work
 * that had already stopped. The fake app-server forces exactly that ordering.
 */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { CodexAppServerClient } from "../src/adapters/codex/app-server-client.ts";
import { CodexOfficeSession } from "../src/adapters/codex/adapter.ts";
import { OfficeState } from "../src/core/state.ts";

const fixture = fileURLToPath(new URL("./fixtures/fake-codex-app-server.mjs", import.meta.url));
const ROUNDS = 8;

for (let round = 0; round < ROUNDS; round += 1) {
	const state = new OfficeState(process.cwd());
	const client = new CodexAppServerClient({ command: process.execPath, args: [fixture] });
	const session = new CodexOfficeSession(state, client, { cwd: process.cwd() });
	try {
		await session.start();
		for (const text of ["first", "second"]) {
			const { turnId } = await session.prompt(text);
			assert.ok(turnId, "prompt must report the turn id Codex returned");
			assert.equal(session.getStatus().busy, false, `round ${round}: a completed turn must not leave the session busy`);
			assert.equal(state.snapshot().session.busy, false, `round ${round}: the office view must not stay busy`);
		}
		assert.equal(state.snapshot().session.turns, 2, `round ${round}: both turns must be counted once`);
	} finally {
		await session.close();
		state.dispose();
	}
}

console.log(`Codex turn race: ${ROUNDS} sessions stayed idle after turns that completed before registration`);

// Stop before the response, between response and notification, and after start.
for (const timing of ["before-response", "before-started", "after-started"] as const) {
	const state = new OfficeState(process.cwd());
	let resolveStart!: (value: unknown) => void;
	let calls = 0;
	const client = {
		request(method: string) {
			if (method === "turn/start") return new Promise((resolve) => { resolveStart = resolve; });
			assert.equal(method, "turn/interrupt");
			calls++;
			return Promise.resolve({});
		},
		close: async () => {},
	};
	const session = new CodexOfficeSession(state, client as never, { cwd: process.cwd() });
	const emit = (method: string) => (session as any).handleMessage({ method, params: { threadId: "root", turn: { id: "turn", status: "interrupted" } } });
	(session as any).threadId = "root";
	state.join("main", { name: "Test", role: "test" });
	try {
		const prompt = session.prompt("test");
		if (timing === "before-response") await session.interrupt();
		resolveStart({ turn: { id: "turn" } });
		await prompt;
		if (timing === "before-started") await session.interrupt();
		assert.equal(calls, 0, "must not interrupt a turn before its started notification");
		emit("turn/started");
		if (timing === "after-started") await session.interrupt();
		await session.interrupt();
		assert.equal(calls, 1, "stop must be delivered exactly once despite repeated clicks");
		emit("turn/completed");
		assert.equal(session.getStatus().busy, false);
		assert.equal(session.getStatus().interrupting, false);
		assert.equal(state.getAgent("main")?.state, "idle");
	} finally { await session.close(); state.dispose(); }
}
console.log("Codex early stop: all three startup orderings passed");
