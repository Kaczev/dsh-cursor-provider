import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bounded, ProviderError, summarizeUsage } from './provider.js';

export const ATTRIBUTION_NOTICE = 'Cursor SDK 1.0.40 has no verified public upstream header injection hook. This plugin does not send DSH attribution headers; this is an explicitly accepted compatibility exception, not DSH certification.';

/** Public SDK only; one isolated agent per call. Never execute host tools here. */
export class CursorTransport {
  #active = new Set(); #closed = false; #catalogs = new Map();
  constructor({ loadSDK = () => import('@cursor/sdk'), timeoutMs = 1_800_000, catalogTTL = 300_000, now = Date.now } = {}) {
    this.loadSDK = loadSDK; this.timeoutMs = timeoutMs; this.catalogTTL = catalogTTL; this.now = now;
  }
  async catalog(apiKey, signal, { refresh = false } = {}) {
    if (this.#closed) throw new ProviderError('DISPOSED', 'Transport closed');
    this.#key(apiKey);
    if (signal?.aborted) throw new ProviderError('ABORTED', 'Request cancelled');
    const key = createHash('sha256').update(apiKey).digest('hex');
    const cached = this.#catalogs.get(key);
    if (!refresh && cached && cached.expires > this.now()) return structuredClone(cached.models);
    try {
      const models = await bounded(async () => {
        const sdk = await this.loadSDK();
        return sdk.Cursor.models.list({ apiKey });
      }, { signal, timeoutMs: this.timeoutMs });
      if (!this.#closed) {
        if (this.#catalogs.size >= 8) this.#catalogs.delete(this.#catalogs.keys().next().value);
        this.#catalogs.set(key, { models: structuredClone(models), expires: this.now() + this.catalogTTL });
      }
      return models;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const status = error?.status;
      if (status === 401 || status === 403) throw new ProviderError('CURSOR_AUTH_FAILED', 'Cursor authentication or account permission was rejected');
      if (status === 429) throw new ProviderError('CURSOR_RATE_LIMITED', 'Cursor rate limit reached');
      if (Number.isInteger(status) && status >= 500 && status <= 599) throw new ProviderError('CURSOR_SERVICE_FAILED', 'Cursor service is temporarily unavailable');
      throw new ProviderError('CURSOR_CATALOG_FAILED', 'Cursor model discovery failed; upstream error details were withheld');
    }
  }
  #key(key) {
    if (typeof key !== 'string' || !key.trim()) throw new ProviderError('MISSING_CREDENTIAL', 'An explicit Cursor credential is required');
  }
  async *stream({ apiKey, model, prompt, signal }) {
    this.#key(apiKey);
    if (this.#closed) throw new ProviderError('DISPOSED', 'Transport closed');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const ticket = { controller }; this.#active.add(ticket);
    let settle;
    ticket.done = new Promise(resolve => { settle = resolve; });
    const deadline = Date.now() + this.timeoutMs;
    const step = () => ({ signal: controller.signal, timeoutMs: Math.max(1, deadline - Date.now()) });
    let agent, run, directory, cleanup;
    const dispose = () => cleanup ??= (async () => {
      try {
        if (run?.supports('cancel') && run.status === 'running') {
          await bounded(() => run.cancel(), { timeoutMs: 5_000 });
        }
      } finally {
        try { if (agent) await bounded(() => agent[Symbol.asyncDispose](), { timeoutMs: 5_000 }); }
        finally { if (directory) await rm(directory, { recursive: true, force: true }); }
      }
    })();
    const turns = [], counts = {};
    let terminalReported = false;
    try {
      directory = await mkdtemp(join(tmpdir(), 'dsh-cursor-'));
      const sdk = await bounded(this.loadSDK, step());
      agent = await bounded(() => sdk.Agent.create({
        apiKey, model, tools: [], mcpServers: {},
        local: { cwd: directory, settingSources: [], customTools: {}, enableAgentRetries: false, store: new sdk.JsonlLocalAgentStore(join(directory, 'state')) },
      }), { ...step(), lateCleanup: async late => {
        try { await late[Symbol.asyncDispose](); } finally { await rm(directory, { recursive: true, force: true }); }
      } });
      run = await bounded(() => agent.send(prompt), { ...step(), lateCleanup: async late => {
        if (late.supports('cancel')) await late.cancel();
      } });
      const iterator = run.stream();
      for (;;) {
        const next = await bounded(() => iterator.next(), step());
        if (next.done) break;
        const event = next.value;
        const kind = ['assistant', 'thinking', 'usage', 'tool_call', 'system', 'status', 'user'].includes(event.type) ? event.type : 'other';
        counts[kind] = (counts[kind] ?? 0) + 1;
        if (event.type === 'tool_call' || (event.type === 'assistant' && event.message.content.some(b => b.type === 'tool_use'))) {
          throw new ProviderError('NATIVE_TOOL_BLOCKED', 'Unexpected Cursor native tool channel; no host tool was executed');
        }
        if (event.type === 'usage') turns.push({ ...event.usage, singleTurn: true });
        if (event.type === 'assistant') for (const block of event.message.content) {
          if (block.type === 'text') yield { type: 'text', text: block.text };
        }
        if (event.type === 'thinking') yield { type: 'reasoning', text: event.text };
      }
      const result = await bounded(() => run.wait(), step());
      terminalReported = true;
      yield { type: 'diagnostic', summary: { status: ['finished', 'cancelled', 'error'].includes(result.status) ? result.status : 'unknown', eventCounts: counts } };
      const usage = turns.length ? summarizeUsage(turns) : result.usage ? { billing: result.usage } : undefined;
      if (usage) yield { type: 'usage', ...usage };
      if (result.status !== 'finished') throw new ProviderError(result.status === 'cancelled' ? 'ABORTED' : 'SDK_RUN_FAILED', 'Cursor run did not finish successfully');
    } catch (error) {
      if (!terminalReported) {
        yield { type: 'diagnostic', summary: { status: controller.signal.aborted ? 'cancelled' : 'error', eventCounts: counts } };
        if (turns.length) yield { type: 'usage', ...summarizeUsage(turns) };
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      try { await dispose(); } finally { this.#active.delete(ticket); settle(); }
    }
  }
  async close() {
    this.#closed = true;
    this.#catalogs.clear();
    const active = [...this.#active];
    for (const ticket of active) ticket.controller.abort();
    await Promise.all(active.map(ticket => ticket.done));
  }
}
