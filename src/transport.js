import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bounded, ProviderError, summarizeUsage } from './provider.js';
import { NativeBridge, bridgeIdentity, historyIdentity, stableHistory } from './native.js';

export const ATTRIBUTION_NOTICE = 'Cursor SDK 1.0.40 has no verified public upstream header injection hook. This plugin does not send DSH attribution headers; this is an explicitly accepted compatibility exception, not DSH certification.';

/** Public SDK only. Pending callbacks hand off to the normal DSH tool pipeline. */
export class CursorTransport {
  #active = new Set(); #closed = false; #catalogs = new Map(); #continuations = new Map(); #idle = new Map();
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
  async *stream(request) {
    const { apiKey, signal, continuation, messages = [] } = request;
    this.#key(apiKey);
    if (this.#closed) throw new ProviderError('DISPOSED', 'Transport closed');
    if (signal?.aborted) throw new ProviderError('ABORTED', 'Request cancelled');
    if (request.system !== undefined && typeof request.system !== 'string') throw new ProviderError('INVALID_SYSTEM_PROMPT', 'DSH system prompt must be a string');
    let state;
    if (continuation) {
      state = this.#continuations.get(continuation);
      if (!state || state.identity !== bridgeIdentity(request) || state.busy) throw new ProviderError('CONTINUATION_UNAVAILABLE', 'Native tool continuation expired or no longer matches this request');
      const history = stableHistory(messages);
      if (history.length < state.prefixLength || historyIdentity(history.slice(0, state.prefixLength)) !== state.prefix) throw new ProviderError('CONTINUATION_UNAVAILABLE', 'Native continuation history was rewritten; start a new conversation');
      state.bridge.results(messages, state.delivered);
      state.detachSignal?.();
      this.#continuations.delete(continuation);
      state.bridge.resume(messages, state.delivered);
    } else {
      const cached = request.sessionId && !request.purpose ? this.#idle.get(request.sessionId) : undefined;
      if (cached) {
        this.#idle.delete(request.sessionId); clearTimeout(cached.idleTimer);
        const prefix = messages.slice(0, cached.committedLength);
        const suffix = messages.slice(cached.committedLength);
        if (cached.identity === bridgeIdentity(request) && historyIdentity(prefix) === cached.committed && suffix.length && suffix.every(m => m.role === 'user') && !JSON.stringify(messages).includes('"type":"image"')) {
          state = cached; state.queue = []; state.token = undefined;
          state.done = this.#produce(state, { ...request, prompt: 'Continue the existing conversation. Only these new messages are appended, in role order:\n' + JSON.stringify(suffix.map(({role,content})=>({role,content}))) });
        } else await cached.dispose();
      }
      state ??= this.#start(request);
    }
    state.busy = true;
    const abort = () => state.controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let handedOff = false, completed = false;
    const content = [];
    try {
      for (;;) {
        const event = await bounded(() => state.next(), { signal: state.controller.signal, timeoutMs: this.timeoutMs });
        if (event.type === 'failure') throw event.error;
        if (event.type === 'done') { completed = state.success === true; break; }
        if (['text','reasoning'].includes(event.type) && event.text) {
          const last = content.at(-1);
          if (last?.type === event.type) last.text += event.text;
          else content.push({type:event.type,text:event.text});
        } else if (event.type === 'tool-call') content.push({...event});
        yield event;
        if (event.type === 'tool-call') {
          // Drain only requests already queued in this native batch. A later
          // callback is delivered in the next DSH step, never executed here.
          state.delivered = [event.id];
          while (state.queue[0]?.type === 'tool-call') {
            const queued = state.queue.shift(); state.delivered.push(queued.id); yield queued;
          }
          const token = randomUUID();
          const history = stableHistory(messages);
          state.prefixLength = history.length;
          state.prefix = historyIdentity(history);
          state.token = token;
          this.#continuations.set(token, state);
          handedOff = true;
          yield { type: 'continuation', token };
          break;
        }
      }
    } catch (error) {
      if (state.timedOut) throw new ProviderError('TIMEOUT', 'Cursor call timed out');
      throw error;
    } finally {
      state.busy = false;
      if (handedOff) state.detachSignal = () => signal?.removeEventListener('abort', abort);
      else if (completed && !this.#closed && request.sessionId && !request.purpose && content.length && !state.controller.signal.aborted) {
        signal?.removeEventListener('abort', abort);
        await state.done;
        const committed = [...messages, {role:'assistant',content}];
        state.committedLength = committed.length; state.committed = historyIdentity(committed);
        const old = this.#idle.get(request.sessionId);
        if (old && old !== state) await old.dispose();
        this.#idle.set(request.sessionId, state);
        state.idleTimer = setTimeout(() => { if (this.#idle.get(request.sessionId) === state) this.#idle.delete(request.sessionId); void state.dispose(); }, this.timeoutMs);
        state.idleTimer.unref?.();
        while (this.#idle.size > 8) { const [key, victim] = this.#idle.entries().next().value; this.#idle.delete(key); await victim.dispose(); }
      } else {
        signal?.removeEventListener('abort', abort);
        state.controller.abort();
        await state.done;
        await state.dispose();
      }
    }
  }
  #start({ apiKey, model, prompt, tools = [], validate, ...identity }) {
    const controller = new AbortController();
    const state = { controller, queue: [], busy: false, identity: bridgeIdentity({ apiKey, model, tools, ...identity }) };
    let wake;
    state.push = event => { state.queue.push(event); wake?.(); wake = undefined; };
    state.next = async () => {
      while (!state.queue.length) await new Promise(resolve => { wake = resolve; });
      return state.queue.shift();
    };
    state.bridge = new NativeBridge(tools, validate, state.push);
    controller.signal.addEventListener('abort', () => state.bridge.close(), { once: true });
    this.#active.add(state);
    // The lifetime includes approval/result waiting, so abandoned continuations
    // cannot retain an SDK agent indefinitely.
    const timer = setTimeout(() => { state.timedOut = true; controller.abort(); }, this.timeoutMs);
    state.dispose = async () => {
      if (state.disposing) return state.disposing;
      state.disposing = (async () => {
        clearTimeout(timer); clearTimeout(state.idleTimer); state.bridge.close();
        try { if (state.agent) await bounded(() => state.agent[Symbol.asyncDispose](), {timeoutMs:5000}); } catch {}
        finally { if(state.directory) await rm(state.directory,{recursive:true,force:true}); this.#active.delete(state); }
      })(); return state.disposing;
    };
    state.done = this.#produce(state, { apiKey, model, prompt, system: identity.system }).finally(() => {
      clearTimeout(timer);
      state.detachSignal?.();
      if (!state.success) this.#active.delete(state);
      if (state.token) this.#continuations.delete(state.token);
    });
    return state;
  }
  async #produce(state, { apiKey, model, prompt, system }) {
    const { controller, bridge, push } = state;
    const step = () => ({ signal: controller.signal, timeoutMs: this.timeoutMs });
    let agent = state.agent, run, directory = state.directory;
    state.success = false;
    const counts = {};
    const runTimer = setTimeout(() => { state.timedOut = true; controller.abort(); }, this.timeoutMs);
    let reportedUsage = false, terminalReported = false;
    try {
      if (!agent) {
      directory = await mkdtemp(join(tmpdir(), 'dsh-cursor-')); state.directory = directory;
      const sdk = await bounded(this.loadSDK, step());
      agent = await bounded(() => sdk.Agent.create({
        apiKey, model, systemPrompt: system?.trim() ? system : 'You are an AI assistant.', tools: bridge.tools.length ? ['mcp'] : [], mcpServers: {},
        local: { cwd: directory, settingSources: [], customTools: bridge.customTools, enableAgentRetries: false, store: new sdk.JsonlLocalAgentStore(join(directory, 'state')) },
      }), { ...step(), lateCleanup: async late => {
        try { await late[Symbol.asyncDispose](); } finally { await rm(directory, { recursive: true, force: true }); }
      } });
      state.agent = agent;
      }
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
        const nativeNames = event.type === 'tool_call' ? [event.name] : event.type === 'assistant' ? event.message.content.filter(b => b.type === 'tool_use').map(b => b.name) : [];
        for (const name of nativeNames) {
          // Only our internally registered MCP family is allowed. These events
          // are observational; authoritative calls come from execute(args).
          if (!bridge.tools.length || typeof name !== 'string' || (name !== 'mcp' && !Object.keys(bridge.customTools).some(alias => name === alias || name === `custom-user-tools-${alias}` || name.endsWith(`__${alias}`)))) {
            throw new ProviderError('NATIVE_TOOL_BLOCKED', 'Unexpected Cursor native tool channel; no host tool was executed');
          }
        }
        if (event.type === 'usage') { reportedUsage = true; push({ type: 'usage', ...summarizeUsage([{ ...event.usage, singleTurn: true }]) }); }
        if (event.type === 'assistant') for (const block of event.message.content) {
          if (block.type === 'text') push({ type: 'text', text: block.text });
        }
        if (event.type === 'thinking') push({ type: 'reasoning', text: event.text });
      }
      const result = await bounded(() => run.wait(), step());
      terminalReported = true;
      push({ type: 'diagnostic', summary: { status: ['finished', 'cancelled', 'error'].includes(result.status) ? result.status : 'unknown', eventCounts: counts } });
      if (!reportedUsage && result.usage) push({ type: 'usage', billing: result.usage });
      if (result.status !== 'finished') {
        const detail = typeof result.error === 'string' ? result.error : JSON.stringify(result.error ?? '');
        if (/system.?prompt/i.test(detail) && /invalid.?argument|permission|not.allowed|not.enabled|access.denied/i.test(detail)) {
          throw new ProviderError('SYSTEM_PROMPT_REJECTED', 'Cursor rejected the custom system prompt; account access is required. No fallback to the Cursor default prompt was attempted');
        }
        throw new ProviderError(result.status === 'cancelled' ? 'ABORTED' : 'SDK_RUN_FAILED', 'Cursor run did not finish successfully');
      }
      state.success = true;
    } catch (error) {
      if (!terminalReported) push({ type: 'diagnostic', summary: { status: controller.signal.aborted ? 'cancelled' : 'error', eventCounts: counts } });
      push({ type: 'failure', error: state.timedOut ? new ProviderError('TIMEOUT', 'Cursor call timed out') : error });
    } finally {
      clearTimeout(runTimer);
      state.detachSignal?.();
      if (state.token) this.#continuations.delete(state.token);
      if (!state.success) {
        try { if(run?.supports?.('cancel') && run.status === 'running') await bounded(()=>run.cancel(),{timeoutMs:5000}); } catch {}
        await state.dispose();
      }
      push({ type: 'done' });
    }
  }
  async close() {
    this.#closed = true;
    this.#catalogs.clear();
    const active = [...this.#active];
    this.#idle.clear();
    for (const state of active) { state.bridge.close(); state.controller.abort(); }
    await Promise.all(active.map(async state => { await state.done; await state.dispose(); }));
    this.#continuations.clear();
  }
}
