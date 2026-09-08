#!/usr/bin/env node
import { CodexAppServerClient } from "../src/adapters/codex/app-server-client.ts";
import { CodexOfficeSession } from "../src/adapters/codex/adapter.ts";
import { OfficeState } from "../src/core/state.ts";

const state = new OfficeState(process.cwd());
const client = new CodexAppServerClient({ cwd: process.cwd() });
const session = new CodexOfficeSession(state, client, { cwd: process.cwd() });
const eventTypes: string[] = [];
const done = new Promise<void>((resolve, reject) => {
	const timer = setTimeout(() => reject(new Error("Timed out waiting for the Codex turn")), 60_000);
	state.subscribe((event) => {
		eventTypes.push(event.type);
		if (event.type === "session" && event.session.turns > 0 && !event.session.busy) {
			clearTimeout(timer);
			resolve();
		}
	});
});

try {
	const started = await session.start();
	await session.prompt("Reply with exactly: Agent Live ready.");
	await done;
	const snapshot = state.snapshot();
	console.log(JSON.stringify({
		ok: true,
		threadId: started.threadId,
		model: started.model,
		eventTypes: [...new Set(eventTypes)],
		agent: snapshot.agents[0],
	}));
} finally {
	await session.close();
	state.dispose();
}
