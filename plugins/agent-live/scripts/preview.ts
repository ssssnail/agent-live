/**
 * Serves the office UI without pi attached, for iterating on the visuals.
 * Open the printed URL with ?demo=1 to play the scripted scene.
 */
import { startServer } from "../src/runtime/server.ts";
import { OfficeState } from "../src/core/state.ts";

const state = new OfficeState(process.cwd());
state.join("main", { name: "阿派", role: "preview" });

const server = await startServer(state, {
	port: Number(process.env.AGENT_LIVE_PORT ?? 7788),
});

console.log(`Agent Live preview: ${server.url}/v2.html?demo=1`);
console.log(`Original demo baseline: ${server.url}/?demo=1`);

process.on("SIGINT", () => {
	void server.close().then(() => process.exit(0));
});
