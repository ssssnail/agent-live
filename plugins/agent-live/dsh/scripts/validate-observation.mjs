import assert from 'node:assert/strict';
import { buildObservation, projectedTokenCount } from '../src/observation.ts';

const input = {
  sessionId: 'root', running: true,
  chat: { legacy: { nodes: [], runningCalls: [
    { phase: 'preparing', callId: 'a', name: 'read', time: 1 },
    { phase: 'start', callId: 'b', name: 'bash', argsRaw: '{"command":"pwd"}', time: 2 },
  ] }, timeline: { turnOrder: ['turn'] } },
  childCatalog: [{ id: 'child', label: 'Inspect code' }],
  childActivity: new Map([['child', true]]),
  summaries: { child: { displayTitle: 'Inspect code', running: false } },
};
let observation = buildObservation(input);
assert.deepEqual(observation.tools[0].args, {});
assert.deepEqual(observation.tools[1].args, { command: 'pwd' });
assert.equal(observation.children[0].running, true, 'live status overrides stale list');
assert.equal(observation.children[0].name, 'Teammate 1');
input.childActivity.set('child', false);
input.summaries.child.running = true;
assert.equal(buildObservation(input).children[0].running, false, 'explicit stop overrides stale list');
input.childActivity.set('child', true);
input.running = false;
assert.equal(buildObservation(input).children[0].running, false, 'stopped parent cannot leave children working');
assert.equal(projectedTokenCount({ uncachedInputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 }), 100);
console.log('DSH 0.2 observation: preparing tools, child start/stop and tokens passed');
