#!/usr/bin/env node
const args = process.argv.slice(2);
const option = (name = "") => {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : undefined;
};

const viewerUrl = option("--url");
const commandJson = option("--json");
if (!viewerUrl || !commandJson) {
	throw new Error("Usage: creator-command.ts --url <authenticated-viewer-url> --json '<Creator command JSON>'");
}

const parsed = new URL(viewerUrl);
const token = parsed.searchParams.get("token");
if (!token || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
	throw new Error("Creator requires an authenticated local Agent Live URL");
}

const command = JSON.parse(commandJson);
const endpoint = new URL("/api/creator", parsed.origin);
const response = await fetch(endpoint, {
	method: "POST",
	headers: { "content-type": "application/json", "x-agent-live-token": token },
	body: JSON.stringify(command),
});
const result = await response.json();
if (!response.ok) throw new Error(result?.error ?? `Creator request failed (${response.status})`);

console.log(JSON.stringify(result));
