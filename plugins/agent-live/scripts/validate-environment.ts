import * as fs from "node:fs";
import { createEnvironmentRuntime } from "../web/v2/environment-runtime.js";

function readConfig(relativePath: string) {
	return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

function validateLocalClock() {
	const environment = createEnvironmentRuntime(readConfig("../web/v2/content/environments/local-office.json"));

	environment.update({ time: "17:59", weather: "rain" });
	if (!environment.isNpcOnDuty("cleaner")) throw new Error("NPC should still be on duty at 17:59");
	if (environment.snapshot().weather !== "rain") throw new Error("Weather override was not applied");

	environment.update({ time: "18:29" });
	if (!environment.isNpcOnDuty("cleaner", undefined, "lin")) throw new Error("NPC should stay through the earliest departure time");

	environment.update({ time: "21:31" });
	if (environment.isNpcOnDuty("cleaner", undefined, "lin")) throw new Error("NPC should leave after the latest departure time");

	environment.update({ time: "20:00" });
	const first = environment.isNpcOnDuty("colleague", undefined, "colleague-a");
	const repeated = environment.isNpcOnDuty("colleague", undefined, "colleague-a");
	if (first !== repeated) throw new Error("NPC daily departure must remain stable for the same identity");

	if (!environment.isNpcOnDuty("security", { start: "18:00", end: "06:00" })) {
		throw new Error("Overnight shift should be active at 20:00");
	}

	let rejected = false;
	try {
		environment.update({ weather: "typhoon" });
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error("Unknown weather should be rejected");
}

function validateFixedClock() {
	const environment = createEnvironmentRuntime(readConfig("../web/v2/content/environments/rainy-night.json"));
	const snapshot = environment.snapshot();

	if (snapshot.hour !== 22 || snapshot.minute !== 0) throw new Error("Fixed clock should start at 22:00");
	if (snapshot.phase !== "night") throw new Error("Fixed clock should resolve to the night phase");
	if (snapshot.weather !== "rain") throw new Error("Fixed weather should stay locked to rain");

	let rejected = false;
	try {
		environment.update({ weather: "typhoon" });
	} catch {
		rejected = true;
	}
	if (!rejected) throw new Error("Unknown weather should be rejected in fixed mode");
}

validateLocalClock();
validateFixedClock();

console.log("Environment validation passed: local clock, fixed clock, weather, staggered departure, day shift and overnight shift");
