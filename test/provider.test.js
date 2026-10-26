import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolParser, SessionPool, resolveVariant, bounded, summarizeUsage } from '../src/provider.js';
const tools = [{ name: 'read', parameters: { type: 'object' } }];
const parser = () => new ToolParser(tools, { validate: (_, args) => typeof args.path === 'string' });
const wire = 'hello<tool_call>{"id":"a","name":"read","arguments":{"path":"x"}}</tool_call>end';
test('tool protocol survives every possible split', () => {
  for (let i = 0; i <= wire.length; i++) {
    const p = parser(), events = [...p.push(wire.slice(0, i)), ...p.push(wire.slice(i), true)];
    assert.equal(events.filter(e => e.type === 'text').map(e => e.text).join(''), 'helloend');
    assert.deepEqual(events.filter(e => e.type === 'tool-call'), [{ type: 'tool-call', id: 'a', name: 'read', arguments: '{"path":"x"}' }]);
  }
});
test('prose is never interpreted as tool intent', () => assert.deepEqual(parser().push('I will read x', true), [{ type: 'text', text: 'I will read x' }]));
test('invalid tools, arguments, truncated JSON, duplicate IDs fail closed', () => {
  for (const payload of ['{"name":"shell","arguments":{}}', '{"name":"read","arguments":{}}', '{bad']) assert.throws(() => parser().push(`<tool_call>${payload}</tool_call>`, true));
  assert.throws(() => parser().push('<tool_call>{', true), { code: 'TRUNCATED_TOOL_CALL' });
  assert.throws(() => new ToolParser(tools).push(wire, true), { code: 'INVALID_ARGUMENTS' });
  const p = parser(); p.push(wire); assert.throws(() => p.push(wire), { code: 'INVALID_TOOL_CALL' });
  assert.throws(() => new ToolParser(tools, { maxBytes: 2 }).push('long'), { code: 'LIMIT' });
});
test('catalog variants are validated and normalized', () => {
  const c = [{ id: 'model', parameters: [{ id: 'fast', values: [true, false] }, { id: 'effort', values: ['high'] }] }];
  assert.equal(resolveVariant('model@fast=true,effort=high', c).variant, 'model@effort=high,fast=true');
  for (const v of ['other', 'model@', 'model@fast=yes', 'model@fast=true,fast=false', 'model@__proto__=x', 'model@fast=true@x']) assert.throws(() => resolveVariant(v, c));
});
function fixture() {
  let next = 0; const disposed = [];
  const pool = new SessionPool({ create: async () => ++next, dispose: async a => { disposed.push(a); }, maxIdle: 1 });
  const base = { sessionId: 's', apiKey: 'fake-test-only', variant: 'm', system: 'sys', tools, messages: ['user'] };
  return { pool, base, disposed };
}
test('exact committed prefix reuses only the new suffix', async () => {
  const { pool, base } = fixture(); const a = await pool.lease(base);
  await a.release({ reusable: true, completedMessages: ['user', 'assistant'] });
  const b = await pool.lease({ ...base, messages: ['user', 'assistant', 'next'] });
  assert.equal(a.agent, b.agent); assert.deepEqual(b.messages, ['next']); await b.release(); await pool.close();
});
test('rewrite, key/model/system/tool changes and auxiliary purposes isolate', async () => {
  for (const patch of [{ messages: ['rewritten'] }, { apiKey: 'different-fake' }, { variant: 'new' }, { system: 'new' }, { tools: [] }, { purpose: 'compaction' }, { purpose: 'session-title' }, { sessionId: undefined }]) {
    const { pool, base } = fixture(); const a = await pool.lease(base); await a.release({ reusable: true, completedMessages: ['user', 'assistant'] });
    const b = await pool.lease({ ...base, ...patch }); assert.notEqual(a.agent, b.agent); await b.release(); await pool.close();
  }
});
test('concurrent leases and failed runs never reuse live agents', async () => {
  const { pool, base, disposed } = fixture(); const [a, b] = await Promise.all([pool.lease(base), pool.lease(base)]);
  assert.notEqual(a.agent, b.agent); await a.release(); await a.release(); await pool.close(); await b.release(); assert.equal(disposed.length, 2);
  await assert.rejects(pool.lease(base), { code: 'DISPOSED' });
});
test('pool closes agents arriving after shutdown', async () => {
  let resolve; const disposed = []; const pool = new SessionPool({ create: () => new Promise(r => { resolve = r; }), dispose: async a => disposed.push(a) });
  const pending = pool.lease({ messages: [] }); await pool.close(); resolve(1); await assert.rejects(pending, { code: 'DISPOSED' }); assert.deepEqual(disposed, [1]);
});
test('timeout and abort clean late results without unhandled rejection', async () => {
  for (const cancel of [false, true]) {
    let resolve, cleaned; const cleanup = new Promise(r => { cleaned = r; }); const controller = new AbortController();
    const pending = bounded(() => new Promise(r => { resolve = r; }), { signal: controller.signal, timeoutMs: 5, lateCleanup: async value => { assert.equal(value, 42); cleaned(); } });
    if (cancel) controller.abort(); await assert.rejects(pending, { code: cancel ? 'ABORTED' : 'TIMEOUT' }); resolve(42); await cleanup;
  }
});
test('billing is summed, context is a single-turn peak, never synthesized', () => {
  assert.deepEqual(summarizeUsage([240000, 241000, 242000].map(inputTokens => ({ inputTokens, singleTurn: true }))), { billing: { inputTokens: 723000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, contextInputTokens: 242000 });
  assert.equal(summarizeUsage([{ inputTokens: 723000 }]).contextInputTokens, undefined);
  assert.throws(() => summarizeUsage([{ inputTokens: -1 }]), { code: 'USAGE' });
});
test('timer bounds reject before invoking an operation', async () => {
  let calls = 0;
  for (const timeoutMs of [0, -1, NaN, Infinity, 2_147_483_648, '100']) {
    await assert.rejects(bounded(() => ++calls, { timeoutMs }), { code: 'CONFIG' });
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(bounded(() => ++calls, { signal: controller.signal }), { code: 'ABORTED' });
  assert.equal(calls, 0);
});
test('usage rejects accumulated overflow and unproven context markers', () => {
  assert.throws(() => summarizeUsage([{ inputTokens: Number.MAX_SAFE_INTEGER }, { inputTokens: 1 }]), { code: 'USAGE' });
  for (const singleTurn of ['true', 1, {}]) assert.equal(summarizeUsage([{ inputTokens: 123, singleTurn }]).contextInputTokens, undefined);
});
test('rejected late operations are observed after cancellation', async () => {
  let reject; const controller = new AbortController();
  const pending = bounded(() => new Promise((_, r) => { reject = r; }), { signal: controller.signal });
  await Promise.resolve(); controller.abort();
  await assert.rejects(pending, { code: 'ABORTED' }); reject(new Error('late synthetic failure'));
  await new Promise(resolve => setImmediate(resolve));
});
test('close disposes active leases exactly once before release', async () => {
  const { pool, base, disposed } = fixture(); const lease = await pool.lease(base);
  await pool.close(); assert.deepEqual(disposed, [lease.agent]);
  await lease.release(); await pool.close(); assert.equal(disposed.length, 1);
});
test('concurrent returns and close retain a single cleanup owner', async () => {
  let next = 0, unblock; const disposed = [];
  const gate = new Promise(r => { unblock = r; });
  const pool = new SessionPool({ create: async () => ++next, dispose: async a => { disposed.push(a); if (a === 1) await gate; } });
  const input = { sessionId: 's', messages: ['u'] };
  const a = await pool.lease(input), b = await pool.lease(input), c = await pool.lease(input);
  await a.release({ reusable: true, completedMessages: ['u'] });
  const rb = b.release({ reusable: true, completedMessages: ['u'] });
  const rc = c.release({ reusable: true, completedMessages: ['u'] });
  const closed = pool.close(); unblock(); await Promise.all([rb, rc, closed]);
  assert.deepEqual(disposed.sort(), [1, 2, 3]);
});
test('invalid committed prefix is destroyed rather than cached', async () => {
  const { pool, base, disposed } = fixture(); const lease = await pool.lease(base);
  await assert.rejects(lease.release({ reusable: true, completedMessages: ['rewritten'] }), { code: 'HISTORY' });
  assert.deepEqual(disposed, [lease.agent]); await pool.close();
});
test('invalid pool bounds and asynchronous validators fail closed', () => {
  for (const maxIdle of [-1, NaN, Infinity, 0.5]) assert.throws(() => new SessionPool({ maxIdle }), { code: 'CONFIG' });
  for (const result of [Promise.resolve(false), 1, 'yes']) assert.throws(() => new ToolParser(tools, { validate: () => result }).push(wire, true), { code: 'INVALID_ARGUMENTS' });
});

