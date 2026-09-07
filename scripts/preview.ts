/**
 * Serves the office UI without pi attached, for iterating on the visuals.
 * Open the printed URL with ?demo=1 to play the scripted scene.
 */
import { startServer } from "../src/server.ts";
import { OfficeState } from "../src/state.ts";

const state = new OfficeState(process.cwd());
state.join("main", { name: "阿派", role: "preview" });

const server = await startServer(state, {
	port: Number(process.env.PI_OFFICE_PORT ?? 7788),
});

console.log(`Agent Office preview: ${server.url}/v2.html?demo=1`);
console.log(`Original demo baseline: ${server.url}/?demo=1`);
console.log(`Activity Hub prototype: ${server.url}/activity-hub.html`);
console.log(`Old-School Office prototype: ${server.url}/old-school-office.html`);
console.log(`Boardroom Office prototype: ${server.url}/boardroom-office.html`);
console.log(`Big Company concept: ${server.url}/big-company.html`);

process.on("SIGINT", () => {
	void server.close().then(() => process.exit(0));
});
