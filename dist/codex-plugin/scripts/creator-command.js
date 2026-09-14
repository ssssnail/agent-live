#!/usr/bin/env node

// plugins/agent-live/scripts/creator-command.ts
var args = process.argv.slice(2);
var option = (name = "") => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : void 0;
};
var viewerUrl = option("--url");
var commandJson = option("--json");
if (!viewerUrl || !commandJson) {
  throw new Error("Usage: creator-command.ts --url <authenticated-viewer-url> --json '<Creator command JSON>'");
}
var parsed = new URL(viewerUrl);
var token = parsed.searchParams.get("token");
if (!token || !["localhost", "127.0.0.1"].includes(parsed.hostname)) {
  throw new Error("Creator requires an authenticated local Agent Live URL");
}
var command = JSON.parse(commandJson);
var endpoint = new URL("/api/creator", parsed.origin);
var response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json", "x-agent-live-token": token },
  body: JSON.stringify(command)
});
var result = await response.json();
if (!response.ok) throw new Error(result?.error ?? `Creator request failed (${response.status})`);
console.log(JSON.stringify(result));
