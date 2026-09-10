import assert from "node:assert/strict";
import { ResourceGuard } from "../src/runtime/resource-guard.ts";

const guard = new ResourceGuard();
const calls: string[] = [];
guard.track("first", () => { calls.push("first"); });
guard.track("failing", () => { calls.push("failing"); throw new Error("expected failure"); });
guard.track("last", () => { calls.push("last"); });

const firstClose = guard.close();
assert.equal(firstClose, guard.close(), "concurrent close calls must share one promise");
await assert.rejects(firstClose, AggregateError);
assert.deepEqual(calls, ["last", "failing", "first"], "all resources must close in reverse order despite failures");
await guard.close();
assert.deepEqual(calls, ["last", "failing", "first"], "closed resources must not run twice");

const timeoutGuard = new ResourceGuard();
let fallbackClosed = false;
timeoutGuard.track("fallback", () => { fallbackClosed = true; });
timeoutGuard.track("hung", () => new Promise(() => {}), { timeoutMs: 10 });
await assert.rejects(timeoutGuard.close(), (error: unknown) => {
	assert(error instanceof AggregateError);
	assert.match(String(error.errors[0]), /Timed out closing hung/);
	return true;
});
assert.equal(fallbackClosed, true, "a timed-out resource must not block remaining cleanup");

console.log("resource guard validation passed");
