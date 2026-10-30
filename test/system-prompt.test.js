import test from 'node:test';
import assert from 'node:assert/strict';
import { CursorTransport } from '../src/transport.js';
import { defineAdapter } from '../src/adapter.js';

const collect = async source => { const out = []; for await (const event of source) out.push(event); return out; };
const user = text => ({ role: 'user', content: [{ type: 'text', text }] });
function fixture(rejectSend = false) {
  const calls = { options: [], prompts: [], disposed: 0 };
  const transport = new CursorTransport({ loadSDK: async () => ({
    JsonlLocalAgentStore: class {},
    Agent: { async create(options) {
      calls.options.push(options);
      return {
        async send(prompt) {
          calls.prompts.push(prompt);
          if (rejectSend) throw new Error('InvalidArgument: --system-prompt is not enabled; synthetic-secret');
          return { async *stream() { yield { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } }; }, async wait() { return { status: 'finished' }; } };
        },
        async [Symbol.asyncDispose]() { calls.disposed++; },
      };
    } },
    Cursor: { models: { list: async () => [{ id: 'mock', displayName: 'Mock' }] } },
  }) });
  const Adapter = defineAdapter({ LlmAdapter: class {}, transport, profile: () => ({}), credential: async () => 'offline' });
  return { transport, calls, adapter: new Adapter() };
}

test('DSH system is passed verbatim to SDK and absent from user JSON', async () => {
  const { transport, adapter, calls } = fixture();
  try {
    const system = '  DSH system\nKeep whitespace and priority.  ';
    const out = await collect(adapter.stream({ provider: 'cursor', model: 'mock', system, messages: [user('hello')] }));
    assert.equal(out.at(-1).reason.kind, 'stop');
    assert.equal(calls.options[0].systemPrompt, system);
    assert.equal(calls.prompts[0].includes(system), false);
    assert.equal(calls.prompts[0].includes('"system":'), false);
    assert.deepEqual(calls.options[0].tools, []);
    assert.deepEqual(calls.options[0].local.settingSources, []);
  } finally { await transport.close(); }
});

test('absent or blank DSH system still replaces Cursor default explicitly', async () => {
  for (const system of [undefined, '', ' \n ']) {
    const { transport, calls } = fixture();
    try {
      await collect(transport.stream({ apiKey: 'offline', model: { id: 'mock' }, system, prompt: 'hello' }));
      assert.equal(calls.options[0].systemPrompt, 'You are an AI assistant.');
    } finally { await transport.close(); }
  }
});

test('system replacement denial fails closed, sanitized, without retrying default', async () => {
  const { transport, adapter, calls } = fixture(true);
  try {
    const out = await collect(adapter.stream({ provider: 'cursor', model: 'mock', system: 'DSH only', messages: [user('hello')] }));
    assert.equal(out.at(-1).reason.kind, 'error');
    assert.equal(calls.options.length, 1);
    assert.equal(calls.prompts.length, 1);
    assert.equal(calls.options[0].systemPrompt, 'DSH only');
    assert.equal(calls.disposed, 1);
    assert.equal(JSON.stringify(out).includes('synthetic-secret'), false);
  } finally { await transport.close(); }
});

test('server-side system prompt gate returns an explicit sanitized failure', async () => {
  let created = 0;
  const transport = new CursorTransport({ loadSDK: async () => ({ JsonlLocalAgentStore: class {}, Agent: { async create() {
    created++;
    return { async send() { return { async *stream() {}, async wait() { return { status: 'error', error: { message: 'InvalidArgument: --system-prompt access denied synthetic-secret' } }; } }; }, async [Symbol.asyncDispose]() {} };
  } } }) });
  try {
    await assert.rejects(collect(transport.stream({ apiKey: 'offline', model: { id: 'mock' }, system: 'DSH only', prompt: 'hello' })), error => {
      assert.equal(error.code, 'SYSTEM_PROMPT_REJECTED');
      assert.equal(error.message.includes('synthetic-secret'), false);
      return true;
    });
    assert.equal(created, 1);
  } finally { await transport.close(); }
});

test('system changes rebuild SDK agent; unchanged system survives appended turns', async () => {
  const { transport, calls } = fixture();
  const base = { apiKey: 'offline', model: { id: 'mock' }, sessionId: 'system-test', system: 'first', tools: [], prompt: 'hello', messages: [user('hello')] };
  const assistant = { role: 'assistant', content: [{ type: 'text', text: 'ok' }] };
  try {
    await collect(transport.stream(base));
    const messages = [...base.messages, assistant, user('next')];
    await collect(transport.stream({ ...base, messages }));
    assert.equal(calls.options.length, 1);
    await collect(transport.stream({ ...base, system: 'second', messages: [...messages, assistant, user('last')] }));
    assert.deepEqual(calls.options.map(o => o.systemPrompt), ['first', 'second']);
  } finally { await transport.close(); }
});
