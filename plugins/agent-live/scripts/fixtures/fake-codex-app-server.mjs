#!/usr/bin/env node
/**
 * Minimal stand-in for `codex app-server --stdio`, used by the Codex adapter tests.
 *
 * It answers the handshake and replays one hostile-but-legal ordering: the
 * `turn/start` response and the `turn/started` / `turn/completed` notifications
 * for that same turn arrive in a single stdout chunk. Reading the response must
 * not resurrect a turn that has already settled.
 *
 * Unknown requests are rejected instead of answered with an empty result, so
 * protocol drift in the adapter fails the test instead of passing silently.
 */
let buffer = "";
let turns = 0;

const send = (...messages) => process.stdout.write(`${messages.map((message) => JSON.stringify(message)).join("\n")}\n`);

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
	buffer += chunk;
	let index;
	while ((index = buffer.indexOf("\n")) >= 0) {
		const line = buffer.slice(0, index).trim();
		buffer = buffer.slice(index + 1);
		if (!line) continue;
		let message;
		try {
			message = JSON.parse(line);
		} catch {
			continue;
		}
		if (message.id === undefined) continue;
		const result = (value) => send({ id: message.id, result: value });
		switch (message.method) {
			case "initialize":
				result({ userAgent: "fake-codex-app-server" });
				break;
			case "model/list":
				result({ data: [{ id: "fake-model", displayName: "Fake Model", isDefault: true }], nextCursor: null });
				break;
			case "thread/start":
				result({ thread: { id: "thread-fake", model: "fake-model" } });
				break;
			case "thread/read":
			case "thread/resume":
				result({ thread: { id: "thread-fake", model: "fake-model" } });
				break;
			case "turn/start": {
				turns += 1;
				const id = `turn-${turns}`;
				send(
					{ id: message.id, result: { turn: { id } } },
					{ method: "turn/started", params: { threadId: "thread-fake", turn: { id } } },
					{ method: "turn/completed", params: { threadId: "thread-fake", turn: { id, status: "completed" } } },
				);
				break;
			}
			case "turn/interrupt":
				result({});
				break;
			default:
				send({ id: message.id, error: { code: -32601, message: `fake app-server does not implement ${message.method}` } });
		}
	}
});
process.stdin.resume();
