import { createHash, randomUUID } from 'node:crypto';

export class ProviderError extends Error {
  constructor(code, message) { super(message); this.name = 'ProviderError'; this.code = code; }
}
const fail = (code, message) => { throw new ProviderError(code, message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Account catalog only: do not invent model IDs or parameter values. */
export function resolveVariant(value, catalog) {
  const [id, suffix, ...extra] = value.split('@');
  if (extra.length || !id) fail('INVALID_MODEL', 'Invalid model variant');
  const model = catalog.find(m => m.id === id);
  if (!model) fail('UNKNOWN_MODEL', 'Model is absent from the account catalog');
  const parameters = {};
  if (suffix !== undefined) {
    if (!suffix) fail('INVALID_PARAMETER', 'Empty model parameters');
    for (const pair of suffix.split(',')) {
      const pieces = pair.split('=');
      const [key, val] = pieces;
      if (pieces.length !== 2 || !key || !val || Object.hasOwn(parameters, key) || ['__proto__', 'constructor', 'prototype'].includes(key)) fail('INVALID_PARAMETER', 'Invalid or duplicate parameter');
      const spec = model.parameters?.find(p => p.id === key);
      if (!spec?.values?.some(v => String(v) === val)) fail('INVALID_PARAMETER', 'Unsupported model parameter');
      parameters[key] = val;
    }
  }
  const normalized = Object.keys(parameters).sort().map(k => `${k}=${parameters[k]}`).join(',');
  return { id, parameters, variant: id + (normalized ? `@${normalized}` : '') };
}

/** Explicit protocol only. Never infer calls from prose or execute tools here. */
export class ToolParser {
  #buffer = ''; #ended = false; #calls = new Set();
  constructor(tools, { maxBytes = 1_048_576, validate = () => false } = {}) {
    this.tools = new Map(tools.map(t => [t.name, t])); this.maxBytes = maxBytes; this.validate = validate;
  }
  push(chunk, final = false) {
    if (this.#ended) fail('PROTOCOL', 'Parser already finished');
    this.#buffer += chunk;
    if (Buffer.byteLength(this.#buffer) > this.maxBytes) fail('LIMIT', 'Tool protocol buffer limit exceeded');
    const events = [], open = '<tool_call>', close = '</tool_call>';
    while (this.#buffer) {
      const start = this.#buffer.indexOf(open);
      if (start < 0) {
        let keep = 0;
        for (let n = 1; n < open.length; n++) if (this.#buffer.endsWith(open.slice(0, n))) keep = n;
        const text = this.#buffer.slice(0, this.#buffer.length - keep);
        if (text) events.push({ type: 'text', text });
        this.#buffer = this.#buffer.slice(text.length); break;
      }
      if (start) { events.push({ type: 'text', text: this.#buffer.slice(0, start) }); this.#buffer = this.#buffer.slice(start); }
      const end = this.#buffer.indexOf(close, open.length);
      if (end < 0) break;
      let call;
      try { call = JSON.parse(this.#buffer.slice(open.length, end)); } catch { fail('INVALID_TOOL_CALL', 'Invalid tool JSON'); }
      if (!object(call) || Object.keys(call).some(k => !['id', 'name', 'arguments'].includes(k)) || typeof call.name !== 'string' || !object(call.arguments)) fail('INVALID_TOOL_CALL', 'Invalid tool envelope');
      const tool = this.tools.get(call.name);
      if (!tool) fail('UNKNOWN_TOOL', 'Tool is not in the active allowlist');
      if (this.validate(tool.parameters, call.arguments) !== true) fail('INVALID_ARGUMENTS', 'Tool arguments do not match schema');
      const id = call.id ?? randomUUID();
      if (typeof id !== 'string' || !id || this.#calls.has(id)) fail('INVALID_TOOL_CALL', 'Invalid or duplicate call ID');
      this.#calls.add(id);
      events.push({ type: 'tool-call', id, name: call.name, arguments: JSON.stringify(call.arguments) });
      this.#buffer = this.#buffer.slice(end + close.length);
    }
    if (final) {
      this.#ended = true;
      if (this.#buffer) fail('TRUNCATED_TOOL_CALL', 'Incomplete tool delimiter or payload');
    }
    return events;
  }
}

const stable = value => JSON.stringify(value);
/** Stores opaque fingerprints only; key material and message bodies never enter pool keys. */
export class SessionPool {
  #idle = new Map(); #active = new Set(); #closed = false;
  constructor({ create, dispose, maxIdle = 8 }) {
    if (!Number.isSafeInteger(maxIdle) || maxIdle < 0) fail('CONFIG', 'maxIdle must be a nonnegative integer');
    this.create = create; this.dispose = dispose; this.maxIdle = maxIdle;
  }
  #dispose(item) {
    // Assign the promise before invoking user cleanup, including synchronous failures.
    item.cleanup ??= Promise.resolve().then(() => this.dispose(item.agent));
    return item.cleanup;
  }
  async lease({ sessionId, purpose, apiKey, variant, system, tools, messages }) {
    if (this.#closed) fail('DISPOSED', 'Pool is closed');
    const digest = createHash('sha256').update(stable([sessionId, apiKey, variant, system, tools])).digest('hex');
    const key = sessionId && !purpose ? digest : randomUUID();
    const history = messages.map(m => createHash('sha256').update(stable(m)).digest('hex'));
    let item = this.#idle.get(key); this.#idle.delete(key);
    if (item && (item.history.length > history.length || !item.history.every((h, i) => h === history[i]))) {
      await this.#dispose(item); item = undefined;
    }
    if (this.#closed) fail('DISPOSED', 'Pool closed during history validation');
    const previous = item?.history.length ?? 0;
    const ticket = { item }; this.#active.add(ticket);
    try { item ??= { agent: await this.create(), history: [] }; ticket.item = item; }
    catch (error) { this.#active.delete(ticket); throw error; }
    if (this.#closed) { this.#active.delete(ticket); await this.#dispose(item); fail('DISPOSED', 'Pool closed during creation'); }
    let released = false;
    return { agent: item.agent, messages: messages.slice(previous), release: async ({ reusable = false, completedMessages } = {}) => {
      if (released) return; released = true; this.#active.delete(ticket);
      if (!reusable || this.#closed || !sessionId || purpose) { await this.#dispose(item); return; }
      if (!Array.isArray(completedMessages)) { await this.#dispose(item); fail('HISTORY', 'Committed history is required for reuse'); }
      let committed;
      try { committed = completedMessages.map(m => createHash('sha256').update(stable(m)).digest('hex')); }
      catch (error) { await this.#dispose(item); throw error; }
      if (history.length > committed.length || !history.every((h, i) => h === committed[i])) {
        await this.#dispose(item); fail('HISTORY', 'Committed history must preserve the leased request prefix');
      }
      item.history = committed;
      const retired = [];
      const existing = this.#idle.get(key);
      if (existing) retired.push(existing);
      // Publish/evict synchronously before awaiting any cleanup: close and other
      // releases must observe one unambiguous owner for every agent.
      this.#idle.set(key, item);
      while (this.#idle.size > this.maxIdle) {
        const [oldKey, old] = this.#idle.entries().next().value;
        this.#idle.delete(oldKey); retired.push(old);
      }
      await Promise.all(retired.map(old => this.#dispose(old)));
    } };
  }
  async close() {
    this.#closed = true;
    const items = new Set([...this.#idle.values(), ...[...this.#active].map(t => t.item).filter(Boolean)]);
    this.#idle.clear();
    await Promise.all([...items].map(item => this.#dispose(item)));
    // Pending create calls own their late-arrival disposal. No unbounded wait
    // for a third-party create operation that might never resolve.
  }
}

/** Bounds lazy operations; late results always have an explicit cleanup owner. */
export async function bounded(operation, { signal, timeoutMs = 30_000, lateCleanup = async () => {} } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) fail('CONFIG', 'timeoutMs must be between 1 and 2147483647 milliseconds');
  if (signal?.aborted) fail('ABORTED', 'Call cancelled');
  let timer, listener, abandoned = false;
  const task = Promise.resolve().then(operation);
  const stop = new Promise((_, reject) => {
    const end = code => { abandoned = true; reject(new ProviderError(code, code === 'ABORTED' ? 'Call cancelled' : 'Operation timed out')); };
    timer = setTimeout(() => end('TIMEOUT'), timeoutMs);
    listener = () => end('ABORTED'); signal?.addEventListener('abort', listener, { once: true });
  });
  task.then(value => { if (abandoned) return lateCleanup(value); }, () => {}).catch(() => {});
  try { return await Promise.race([task, stop]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', listener); }
}

/** Billing sum and maximum observed single-turn context are deliberately distinct. */
export function summarizeUsage(turns) {
  const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
  const billing = Object.fromEntries(fields.map(k => [k, 0]));
  let contextInputTokens;
  for (const turn of turns) {
    for (const k of fields) {
      if (turn[k] !== undefined && (!Number.isSafeInteger(turn[k]) || turn[k] < 0)) fail('USAGE', 'Invalid usage count');
      billing[k] += turn[k] ?? 0;
      if (!Number.isSafeInteger(billing[k])) fail('USAGE', 'Accumulated usage exceeds safe integer range');
    }
    if (turn.singleTurn === true && turn.inputTokens !== undefined) contextInputTokens = Math.max(contextInputTokens ?? 0, turn.inputTokens);
  }
  return { billing, contextInputTokens };
}
