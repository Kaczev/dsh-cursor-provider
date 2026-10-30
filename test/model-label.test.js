import test from 'node:test';
import assert from 'node:assert/strict';
import { defineAdapter } from '../src/adapter.js';
import { CursorTransport } from '../src/transport.js';

const models = [{ id: 'grok-4.7', displayName: 'Grok 4.7' }, { id: 'marked', displayName: 'Cursor Marked' }];
function adapter(config = {}) {
  const Adapter = defineAdapter({ LlmAdapter: class {}, credential: async () => 'offline', profile: () => config, transport: { catalog: async () => models } });
  return new Adapter();
}
test('default model names identify Cursor without changing IDs or duplicating prefix', async () => {
  const a = adapter();
  assert.deepEqual((await a.listModels()).map(({ id, name }) => ({ id, name })), [{ id: 'grok-4.7', name: 'Cursor Grok 4.7' }, { id: 'marked', name: 'Cursor Marked' }]);
  assert.equal((await a.resolveModel('cursor', 'grok-4.7')).name, 'Cursor Grok 4.7');
  assert.equal((await a.resolveModel('cursor', 'marked')).name, 'Cursor Marked');
});
test('legacy IDs and blank names use prefixed defaults; explicit custom names remain', async () => {
  for (const item of ['grok-4.7', { id: 'grok-4.7', name: '' }]) {
    const a = adapter({ models: [item] });
    assert.equal((await a.listModels())[0].name, 'Cursor Grok 4.7');
  }
  const a = adapter({ models: [{ id: 'grok-4.7', name: 'My model Fast' }] });
  assert.equal((await a.listModels())[0].name, 'My model Fast');
  assert.equal((await a.resolveModel('cursor', 'grok-4.7')).name, 'My model Fast');
});
test('default transport does not request restricted system replacement', async () => {
  let options;
  const t = new CursorTransport({ loadSDK: async () => ({ JsonlLocalAgentStore: class {}, Agent: { async create(value) {
    options = value;
    return { async send() { return { async *stream() {}, async wait() { return { status: 'finished' }; } }; }, async [Symbol.asyncDispose]() {} };
  } } }) });
  try {
    for await (const event of t.stream({ apiKey: 'offline', model: { id: 'mock' }, system: 'DSH system', prompt: 'hello' })) {}
    assert.equal(Object.hasOwn(options, 'systemPrompt'), false);
  } finally { await t.close(); }
});
