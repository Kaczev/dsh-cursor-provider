import test from 'node:test';
import assert from 'node:assert/strict';
import { CursorTransport } from '../src/transport.js';
import { AssistantStreamAccumulator } from '@deepseek-ai/dsh-llm';
import { defineAdapter } from '../src/adapter.js';

const tools = [{ name: 'safe', description: 'Read a mock value', parameters: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'] } }];
const collect = async source => { const out = [], accumulator = new AssistantStreamAccumulator(); for await (const event of source) { accumulator.push({ time: out.length, chunk: event }); out.push(event); } return out; };
function fixture({ denied = false, duringSend = false } = {}) {
  const calls = { executed: 0, disposed: 0, sent: 0 };
  let custom, release;
  const completed = new Promise(resolve => { release = resolve; });
  const invoke = async () => {
    calls.result = await custom.safe.execute({ n: 7 }, { toolCallId: 'sdk-1' });
    release();
  };
  const run = {
    status: 'running', supports: () => true,
    async *stream() {
      if (!duringSend) void invoke().catch(() => release());
      await completed;
      yield { type: 'usage', usage: { inputTokens: 4, outputTokens: 2 } };
      yield { type: 'assistant', message: { content: [{ type: 'text', text: denied ? 'denied' : 'result received' }] } };
    },
    async wait() { this.status = 'finished'; return { status: 'finished' }; },
    async cancel() { this.status = 'cancelled'; release(); },
  };
  const transport = new CursorTransport({ timeoutMs: 1000, loadSDK: async () => ({
    Cursor: { models: { list: async () => [{ id: 'mock', displayName: 'Mock' }] } },
    JsonlLocalAgentStore: class {},
    Agent: { create: async options => {
      calls.options = options; custom = options.local.customTools;
      return { async send() { calls.sent++; if (duringSend) await invoke(); return run; }, async [Symbol.asyncDispose]() { calls.disposed++; } };
    } },
  }) });
  const Adapter = defineAdapter({ LlmAdapter: class {}, transport, profile: () => ({}), credential: async () => 'mock-key', validate: (_schema, args) => Number.isInteger(args.n) });
  return { adapter: new Adapter(), transport, calls };
}
const snapshot = text => ({ role: 'user', source: { kind: 'runtime-context', form: 'snapshot' }, content: [{ type: 'text', text }] });
for (const replace of [false, true]) test(`runtime snapshot continuation; replace=${replace}`, async () => {
  const { adapter, transport, calls } = fixture();
  try {
    const initial = { ...options, messages: [snapshot('old snapshot'), ...options.messages] };
    const first = await collect(adapter.stream(initial));
    const call = first.find(event => event.type === 'block-end').block;
    const messages = [...(replace ? options.messages : initial.messages),
      { role: 'assistant', source: { replayState: first.at(-1).replayState }, content: [call] },
      { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: '123' }] }, snapshot('new snapshot')];
    const second = await collect(adapter.stream({ ...options, messages }));
    assert.equal(second.at(-1).reason.kind, 'stop');
    assert.ok(calls.result.content.some(block => block.text.includes('new snapshot')));
    assert.equal(calls.sent, 1);
  } finally { await transport.close(); }
});
test('ordinary user messages cannot silently enter a suspended SDK run', async () => {
  const { adapter, transport } = fixture();
  try {
    const first = await collect(adapter.stream(options));
    const call = first.find(event => event.type === 'block-end').block;
    const second = await collect(adapter.stream({ ...options, messages: [...options.messages,
      { role: 'assistant', source: { replayState: first.at(-1).replayState }, content: [call] },
      { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: '123' }] },
      { role: 'user', content: [{ type: 'text', text: 'changed task' }] }] }));
    assert.equal(second.at(-1).reason.failure.code, 'TOOL_RESULT_MISMATCH');
  } finally { await transport.close(); }
});
test('two native tool rounds preserve updated snapshots and strict host chunks', async () => {
  let custom, sent = 0;
  const results = [];
  const transport = new CursorTransport({ timeoutMs: 1000, loadSDK: async () => ({
    Cursor: { models: { list: async () => [{ id: 'mock' }] } }, JsonlLocalAgentStore: class {},
    Agent: { create: async config => {
      custom = config.local.customTools;
      return { async send() { sent++; return { status: 'running', supports: () => false,
        async *stream() {
          for (const n of [1, 2]) results.push(await custom.safe.execute({ n }));
          yield { type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } };
        }, async wait() { return { status: 'finished' }; } }; }, async [Symbol.asyncDispose]() {} };
    } },
  }) });
  const Adapter = defineAdapter({ LlmAdapter: class {}, transport, profile: () => ({}), credential: async () => 'mock-key', validate: () => true });
  const adapter = new Adapter();
  let messages = [...options.messages];
  try {
    for (const n of [1, 2]) {
      const out = await collect(adapter.stream({ ...options, messages }));
      assert.equal(out.at(-1).reason.kind, 'tool-calls');
      const blocks = out.filter(event => event.type === 'block-end').map(event => event.block);
      const call = blocks.find(block => block.type === 'tool-call');
      messages = [...messages.filter(message => message.source?.kind !== 'runtime-context'),
        { role: 'assistant', source: { replayState: out.at(-1).replayState }, content: blocks },
        { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: `value${n}` }] }, snapshot(`context${n}`)];
    }
    const final = await collect(adapter.stream({ ...options, messages }));
    assert.equal(final.at(-1).reason.kind, 'stop');
    assert.equal(sent, 1);
    assert.equal(results.length, 2);
    for (const [i, result] of results.entries()) assert.ok(result.content.some(block => block.text.includes(`context${i + 1}`)));
  } finally { await transport.close(); }
});
const options = { provider: 'cursor', model: 'mock', sessionId: 'session-a', tools, messages: [{ role: 'user', content: [{ type: 'text', text: 'read mock' }] }] };
for (const duringSend of [false, true]) test(`native handoff and callback result resume; duringSend=${duringSend}`, async () => {
  const { adapter, transport, calls } = fixture({ duringSend });
  try {
    const first = await collect(adapter.stream(options));
    assert.equal(first.at(-1).reason.kind, 'tool-calls');
    assert.equal(calls.executed, 0); assert.equal(calls.disposed, 0);
    assert.deepEqual(calls.options.tools, ['mcp']);
    assert.deepEqual(calls.options.mcpServers, {});
    const call = first.find(event => event.type === 'block-end').block;
    assert.equal(call.name, 'safe'); assert.equal(call.arguments, '{"n":7}');
    const messages = [...options.messages, { role: 'assistant', source: { replayState: first.at(-1).replayState }, content: [call] }, { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: 'value=123' }] }];
    const second = await collect(adapter.stream({ ...options, messages }));
    assert.equal(second.at(-1).reason.kind, 'stop');
    assert.equal(calls.sent, 1); assert.equal(calls.disposed, 1);
    assert.deepEqual(calls.result, { content: [{ type: 'text', text: 'value=123' }], isError: false });
  } finally { await transport.close(); }
});
test('denial returns isError through native callback, not fabricated success', async () => {
  const { adapter, transport, calls } = fixture({ denied: true });
  try {
    const first = await collect(adapter.stream(options));
    const call = first.find(event => event.type === 'block-end').block;
    const second = await collect(adapter.stream({ ...options, messages: [...options.messages,
      { role: 'assistant', source: { replayState: first.at(-1).replayState }, content: [call] },
      { role: 'tool', toolCallId: call.id, isError: true, content: [{ type: 'text', text: 'Approval denied' }] },
    ] }));
    assert.equal(second.at(-1).reason.kind, 'stop'); assert.equal(calls.result.isError, true);
  } finally { await transport.close(); }
});
test('mismatched results fail closed; unload cancels suspended callback', async () => {
  const { adapter, transport, calls } = fixture();
  const first = await collect(adapter.stream(options));
  const second = await collect(adapter.stream({ ...options, messages: [...options.messages, { role: 'assistant', source: { replayState: first.at(-1).replayState }, content: [] }] }));
  assert.equal(second.at(-1).reason.failure.code, 'TOOL_RESULT_MISMATCH');
  await transport.close(); assert.equal(calls.disposed, 1);
});
test('rewritten history cannot resume an old native run', async () => {
  const { adapter, transport } = fixture();
  try {
    const first = await collect(adapter.stream(options));
    const call = first.find(event => event.type === 'block-end').block;
    const out = await collect(adapter.stream({ ...options, messages: [{ role: 'user', content: [{ type: 'text', text: 'rewritten' }] },
      { role: 'assistant', source: { replayState: first.at(-1).replayState }, content: [call] },
      { role: 'tool', toolCallId: call.id, content: [{ type: 'text', text: '123' }] }] }));
    assert.equal(out.at(-1).reason.failure.code, 'CONTINUATION_UNAVAILABLE');
  } finally { await transport.close(); }
});
test('abort after handoff releases pending native callback', async () => {
  const { adapter, transport, calls } = fixture({ duringSend: true });
  const controller = new AbortController();
  await collect(adapter.stream({ ...options, signal: controller.signal }));
  controller.abort();
  await transport.close();
  assert.equal(calls.disposed, 1);
});
test('text envelopes remain literal text and never trigger correction or execution', async () => {
  let requests = 0;
  const Adapter = defineAdapter({ LlmAdapter: class {}, profile: () => ({}), credential: async () => 'mock', transport: {
    catalog: async () => [{ id: 'mock' }], async *stream() { requests++; yield { type: 'text', text: '<tool_call>{bad}</tool_call>' }; },
  } });
  const out = await collect(new Adapter().stream(options));
  assert.equal(out.at(-1).reason.kind, 'stop'); assert.equal(requests, 1);
  assert.equal(out.some(event => event.type === 'tool-call-delta'), false);
});
