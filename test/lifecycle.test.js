import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { CursorTransport } from '../src/transport.js';

const collect = async source => { for await (const _ of source) {} };
function stalled(stage, timeoutMs = 1000) {
  let reached;
  const ready = new Promise(resolve => { reached = resolve; });
  const calls = { disposed: 0, cancelled: 0 };
  const hang = () => { reached(); return new Promise(() => {}); };
  const run = { status: 'running', supports: () => true,
    stream: () => ({ next: stage === 'pull' ? hang : async () => ({ done: true }) }),
    wait: stage === 'wait' ? hang : async () => ({ status: 'finished' }),
    cancel: async () => { calls.cancelled++; },
  };
  const agent = { send: stage === 'send' ? hang : async () => run,
    [Symbol.asyncDispose]: async () => { calls.disposed++; },
  };
  const transport = new CursorTransport({ timeoutMs, loadSDK: async () => ({
    JsonlLocalAgentStore: class {},
    Agent: { create: async options => { calls.cwd = options.local.cwd; return agent; } },
  }) });
  return { transport, calls, ready };
}
for (const stage of ['send', 'pull', 'wait']) {
  test(`unload cancels ${stage} and awaits resource cleanup`, async () => {
    const { transport, calls, ready } = stalled(stage);
    const result = assert.rejects(collect(transport.stream({ apiKey: 'mock', model: { id: 'mock' }, prompt: '' })), { code: 'ABORTED' });
    await ready;
    await transport.close();
    await result;
    assert.equal(calls.disposed, 1);
    await assert.rejects(access(calls.cwd), { code: 'ENOENT' });
  });
  test(`deadline covers ${stage}`, async () => {
    const { transport, calls } = stalled(stage, 20);
    await assert.rejects(collect(transport.stream({ apiKey: 'mock', model: { id: 'mock' }, prompt: '' })), { code: 'TIMEOUT' });
    assert.equal(calls.disposed, 1);
    await transport.close();
  });
}
