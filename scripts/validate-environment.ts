import * as fs from "node:fs";
import { createEnvironmentRuntime } from "../web/v2/environment-runtime.js";

const config = JSON.parse(fs.readFileSync(new URL("../web/v2/content/environments/local-office.json", import.meta.url), "utf8"));
const environment = createEnvironmentRuntime(config);

environment.update({ time: "17:59", weather: "rain" });
if (!environment.isNpcOnDuty("cleaner")) throw new Error("NPC should still be on duty at 17:59");
if (environment.snapshot().weather !== "rain") throw new Error("Weather override was not applied");

environment.update({ time: "18:00" });
if (environment.isNpcOnDuty("cleaner")) throw new Error("NPC should leave at 18:00");

if (!environment.isNpcOnDuty("security", { start: "18:00", end: "06:00" })) {
	throw new Error("Overnight shift should be active at 18:00");
}

let rejected = false;
try {
	environment.update({ weather: "typhoon" });
} catch {
	rejected = true;
}
if (!rejected) throw new Error("Unknown weather should be rejected");

console.log("Environment validation passed: clock, weather, day shift, overnight shift");
