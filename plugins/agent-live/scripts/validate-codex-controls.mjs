import assert from 'node:assert/strict';
import { installCodexControls } from '../web/v2/codex-controls.js';

// Minimal DOM contract: exercise the real controls, including polling while
// typing. No browser, model, or user profile is required by this regression.
class Element {
  children = []; handlers = {}; value = ''; dataset = {}; hidden = false;
  constructor(tag = 'div') { this.tag = tag; }
  append(...children) { this.children.push(...children); }
  after(child) { this.sibling = child; }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  setAttribute() {}
  querySelectorAll(tag) { return this.children.flatMap(c => [ ...(c.tag === tag ? [c] : []), ...c.querySelectorAll(tag) ]); }
  querySelector(tag) { return tag.includes('data-approval') ? allowButton : this.querySelectorAll(tag)[0]; }
}
const elements = Object.fromEntries(['clientControls', 'promptInput', 'sendPrompt', 'stopTurn', 'approval', 'approvalTitle', 'approvalDetail'].map(id => [id, new Element()]));
const allowButton = new Element('button');
let status = { busy: true, approval: { id: 1, method: 'item/tool/requestUserInput', title: '', detail: '', questions: [{ id: 'q', question: 'Choose', options: [{ label: 'Blue' }] }] } };
let poll;
const posts = [];
globalThis.document = { hidden: false, getElementById: id => elements[id], createElement: tag => new Element(tag), addEventListener() {} };
globalThis.window = { AgentLiveI18n: { t: key => key, text: value => value }, setTimeout(fn) { poll = fn; return 0; }, addEventListener() {} };
globalThis.fetch = async (url, options) => {
  if (options.method === 'POST') { posts.push(JSON.parse(options.body)); status = { busy: true, approval: null }; }
  return { ok: true, json: async () => status };
};
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
installCodexControls('test-token');
await flush();
const inputs = elements.approvalDetail.sibling;
const field = inputs.querySelector('input');
assert(field);
field.value = 'My choice';
await poll();
assert.equal(inputs.querySelector('input'), field, 'poll must not replace an in-progress answer');
assert.equal(field.value, 'My choice');
elements.approval.handlers.click({ target: { closest: () => ({ dataset: { approval: 'allow' } }) } });
await flush();
assert.deepEqual(posts[0], { id: 1, allow: true, input: { q: 'My choice' } });
assert.equal(elements.approval.hidden, true);
status = { busy: true, approval: { id: 2, method: 'mcpServer/elicitation/request', title: 'MCP', detail: '', schema: { type: 'object' } } };
await poll();
inputs.querySelector('textarea').value = 'not JSON';
elements.approval.handlers.click({ target: { closest: () => ({ dataset: { approval: 'allow' } }) } });
await flush();
assert.equal(posts.length, 1, 'invalid JSON must not send a response');
inputs.querySelector('textarea').value = '{"name":"Blue"}';
elements.approval.handlers.click({ target: { closest: () => ({ dataset: { approval: 'allow' } }) } });
await flush();
assert.deepEqual(posts[1].input, { name: 'Blue' });
status = { busy: true, approval: { id: 3, title: 'MCP', detail: '', url: 'javascript:alert(1)' } };
await poll();
assert.equal(inputs.querySelectorAll('a').length, 0, 'host-provided URLs must not execute scripts');
console.log('Codex controls: answers survive polling, form validation, submission and safe links passed');
