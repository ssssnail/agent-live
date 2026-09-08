#!/usr/bin/env node
import { CodexAppServerClient } from "../src/adapters/codex/app-server-client.ts";

const client = new CodexAppServerClient({
	cwd: process.cwd(),
	onStderr(text) {
		if (process.env.AGENT_LIVE_DEBUG === "1") process.stderr.write(text);
	},
});

try {
	const initialize = await client.start();
	const started = await client.request("thread/start", {
		cwd: process.cwd(),
		ephemeral: true,
		approvalPolicy: "never",
		sandbox: "read-only",
	});
	const thread = (started as { thread?: { id?: string } }).thread;
	if (!thread?.id) throw new Error("thread/start did not return a thread id");
	console.log(JSON.stringify({
		ok: true,
		userAgent: initialize.userAgent,
		threadId: thread.id,
	}));
} finally {
	await client.close();
}
