import test from 'node:test';
import assert from 'node:assert/strict';
import { CursorTransport, ATTRIBUTION_NOTICE } from '../src/transport.js';

function fixture(events, status = 'finished') {
  const calls = { disposed: 0, cancelled: 0 };
  const run = { status, supports: () => true,
    async *stream() { yield* events; },
    async wait() { calls.waited = true; return { status }; },
    async cancel() { calls.cancelled++; },
  };
  const agent = {
    async send(prompt) { calls.prompt = prompt; return run; },
    async [Symbol.asyncDispose]() { calls.disposed++; },
  };
  const transport = new CursorTransport({ loadSDK: async () => ({
    JsonlLocalAgentStore: class { constructor(path) { this.path = path; } },
    Cursor: { models: { list: async args => { calls.auth = args; return [{ id: 'mock' }]; } } },
    Agent: { create: async options => { calls.options = options; return agent; } },
  }) });
  return { transport, calls };
}
test('catalog caches by credential, expires and supports explicit refresh', async () => {
  let requests=0, time=0;
  const transport=new CursorTransport({now:()=>time,catalogTTL:100,loadSDK:async()=>({Cursor:{models:{list:async()=>{requests++;return [{id:'mock'}];}}}})});
  const first=await transport.catalog('key-a'); first[0].id='mutated';
  assert.equal((await transport.catalog('key-a'))[0].id,'mock'); assert.equal(requests,1);
  await transport.catalog('key-b'); assert.equal(requests,2);
  await transport.catalog('key-a',undefined,{refresh:true}); assert.equal(requests,3);
  time=101; await transport.catalog('key-a'); assert.equal(requests,4);
  await assert.rejects(transport.catalog('key-a',AbortSignal.abort()),{code:'ABORTED'});
  await transport.close();
});

test('catalog errors never expose upstream credential text', async () => {
  const transport = new CursorTransport({ loadSDK: async () => ({
    Cursor: { models: { list: async () => { throw new Error('synthetic-secret-in-upstream-url'); } } },
  }) });
  await assert.rejects(transport.catalog('mock-only'), error => {
    assert.equal(error.code, 'CURSOR_CATALOG_FAILED');
    assert.equal(String(error).includes('synthetic-secret'), false);
    return true;
  });
  const signal = AbortSignal.abort();
  await assert.rejects(transport.catalog('mock-only', signal), { code: 'ABORTED' });
  await transport.close();
});

test('catalog status classification excludes raw SDK error text', async () => {
  for (const [status, code] of [[401,'CURSOR_AUTH_FAILED'],[403,'CURSOR_AUTH_FAILED'],[429,'CURSOR_RATE_LIMITED'],[503,'CURSOR_SERVICE_FAILED']]) {
    const transport = new CursorTransport({ loadSDK: async () => ({ Cursor: { models: { list: async () => { throw Object.assign(new Error('secret-example'), {status}); } } } }) });
    await assert.rejects(transport.catalog('mock-only'), error => error.code === code && !String(error).includes('secret-example'));
    await transport.close();
  }
});
const collect = async source => { const out = []; for await (const e of source) out.push(e); return out; };

test('explicit credential, public catalog and attribution disclosure', async () => {
  const { transport, calls } = fixture([]);
  await assert.rejects(transport.catalog(''), { code: 'MISSING_CREDENTIAL' });
  assert.deepEqual(await transport.catalog('mock-only'), [{ id: 'mock' }]);
  assert.equal(calls.auth.apiKey, 'mock-only');
  assert.match(ATTRIBUTION_NOTICE, /does not send/);
});

test('isolated text-only SDK options, terminal wait, usage and disposal', async () => {
  const { transport, calls } = fixture([
    { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } },
    { type: 'usage', usage: { inputTokens: 12, outputTokens: 1 } },
  ]);
  const out = await collect(transport.stream({ apiKey: 'mock-only', model: { id: 'mock' }, prompt: 'hello' }));
  assert.deepEqual(calls.options.tools, []);
  assert.deepEqual(calls.options.mcpServers, {});
  assert.deepEqual(calls.options.local.settingSources, []);
  assert.deepEqual(calls.options.local.customTools, {});
  assert.equal(calls.disposed, 1); assert.equal(calls.waited, true);
  assert.equal(calls.options.local.enableAgentRetries, false);
  const usage = out.filter(e => e.type === 'usage');
  assert.equal(usage.reduce((sum, event) => sum + event.billing.inputTokens, 0), 22);
  assert.equal(usage.at(-1).contextInputTokens, 12);
  assert.deepEqual(out.find(e => e.type === 'diagnostic').summary, { status: 'finished', eventCounts: { assistant: 1, usage: 2 } });
});

test('SDK image payload reaches send unchanged with native tools disabled', async () => {
  const {transport,calls}=fixture([]);
  const prompt={text:'look',images:[{data:'AQID',mimeType:'image/png',dimension:{width:2,height:3}}]};
  await collect(transport.stream({apiKey:'mock-only',model:{id:'mock'},prompt}));
  assert.equal(calls.prompt,prompt); assert.deepEqual(calls.options.tools,[]);
  assert.equal(calls.disposed,1);
});

test('native tool channel fails closed without executing it', async () => {
  const { transport, calls } = fixture([{ type: 'tool_call', name: 'shell' }]);
  await assert.rejects(collect(transport.stream({ apiKey: 'mock-only', model: { id: 'mock' }, prompt: '' })), { code: 'NATIVE_TOOL_BLOCKED' });
  assert.equal(calls.disposed, 1);
});

test('blocked native events retain only sanitized counts and received billing', async () => {
  const { transport } = fixture([{ type: 'usage', usage: { inputTokens: 4 } }, { type: 'tool_call', name: 'secret-tool', arguments: { token: 'secret-value' } }]);
  const out = [];
  await assert.rejects(async () => { for await (const event of transport.stream({ apiKey: 'mock-only', model: { id: 'mock' }, prompt: '' })) out.push(event); }, { code: 'NATIVE_TOOL_BLOCKED' });
  assert.deepEqual(out.find(e => e.type === 'diagnostic').summary, { status: 'error', eventCounts: { usage: 1, tool_call: 1 } });
  assert.equal(out.find(e => e.type === 'usage').billing.inputTokens, 4);
  assert.equal(JSON.stringify(out).includes('secret'), false);
});
test('failed run reports usage and terminal metadata exactly once', async () => {
  const { transport } = fixture([{ type: 'usage', usage: { inputTokens: 5 } }], 'error');
  const out = [];
  await assert.rejects(async () => { for await (const event of transport.stream({ apiKey: 'mock-only', model: { id: 'mock' }, prompt: '' })) out.push(event); }, { code: 'SDK_RUN_FAILED' });
  assert.equal(out.filter(e => e.type === 'usage').length, 1);
  assert.equal(out.filter(e => e.type === 'diagnostic').length, 1);
  assert.equal(out.find(e => e.type === 'diagnostic').summary.status, 'error');
});

test('run failure is not presented as success; closed transport rejects calls', async () => {
  const { transport, calls } = fixture([], 'error');
  await assert.rejects(collect(transport.stream({ apiKey: 'mock-only', model: { id: 'mock' }, prompt: '' })), { code: 'SDK_RUN_FAILED' });
  assert.equal(calls.disposed, 1);
  await transport.close();
  await assert.rejects(transport.catalog('mock-only'), { code: 'DISPOSED' });
});
