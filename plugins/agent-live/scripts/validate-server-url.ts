#!/usr/bin/env node
import { resolveViewerUrl } from "../src/runtime/server.ts";

const base = "http://localhost:7788";
const cases = [
	{ target: "", expected: base },
	{ target: "v2.html?demo=1", expected: `${base}/v2.html?demo=1` },
	{ target: "/v2.html#office", expected: `${base}/v2.html#office` },
	{ target: "v2.html?preset=tech%20open", expected: `${base}/v2.html?preset=tech%20open` },
];

for (const { target, expected } of cases) {
	const actual = resolveViewerUrl(base, target);
	if (actual !== expected) {
		throw new Error(`resolveViewerUrl(${JSON.stringify(target)}) = ${actual}, expected ${expected}`);
	}
}

console.log(`Server URL validation passed: ${cases.length} target forms`);
