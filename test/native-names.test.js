import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeBridge } from '../src/native.js';

const tool = name => ({ name, description: 'Mock read', parameters: { type: 'object' } });
test('semantic registration names survive tool reordering and punctuation', async () => {
  const names = ['ops_glob', 'functions.read'];
  const events = [];
  const bridge = new NativeBridge(names.map(tool), () => true, event => events.push(event));
  const reverse = new NativeBridge([...names].reverse().map(tool), () => true, () => {});
  assert.deepEqual(Object.keys(bridge.customTools), names);
  assert.deepEqual(Object.keys(reverse.customTools).sort(), [...names].sort());
  const promise = bridge.customTools['functions.read'].execute({ path: 'mock' });
  assert.equal(events[0].name, 'functions.read');
  bridge.close(); reverse.close();
  await assert.rejects(promise, { code: 'ABORTED' });
  assert.throws(() => new NativeBridge([tool('same'), tool('same')], () => true, () => {}), { code: 'INVALID_TOOLS' });
});
