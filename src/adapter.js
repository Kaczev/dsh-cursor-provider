import { ProviderError, resolveVariant, summarizeUsage } from './provider.js';
import { imagePrompt } from './images.js';

// Some SDK catalogs describe selectable values only through variants.
// Normalize once so metadata and request validation agree on those values.
function parameterDefinitions(model) {
  const parameters = new Map((model.parameters ?? []).map(p => [p.id, { ...p, values: p.values.map(v => ({ ...v })) }]));
  for (const variant of model.variants ?? []) for (const param of variant.params) {
    let definition = parameters.get(param.id);
    if (!definition) {
      definition = { id: param.id, values: [] };
      parameters.set(param.id, definition);
    }
    if (!definition.values.some(v => v.value === param.value)) {
      definition.values.push({ value: param.value });
    }
  }
  return [...parameters.values()];
}
function reasoningParameter(model) {
  const parameters = parameterDefinitions(model);
  return ['reasoning_effort', 'effort', 'reasoning'].map(id => parameters.find(p => p.id === id)).find(Boolean);
}
export function sdkCatalog(models) {
  return models.map(m => ({ ...m, parameters: parameterDefinitions(m).map(p => ({ ...p, values: p.values.map(v => v.value) })) }));
}
export function contextChoices(model) {
  return (parameterDefinitions(model).find(p => p.id === 'context')?.values ?? [])
    .map(({value}) => { const m = /^(\d+(?:\.\d+)?)([km])?$/i.exec(value); return {value, tokens: m ? Number(m[1]) * ({k:1000,m:1000000}[m[2]?.toLowerCase()] ?? 1) : NaN}; })
    .filter(p => Number.isSafeInteger(p.tokens) && p.tokens > 0).sort((a,b) => a.tokens-b.tokens);
}
export function modelSelection(value, models, effort, fast, budget) {
  const resolved = resolveVariant(value, sdkCatalog(models));
  const params = { ...resolved.parameters };
  const fastParameter = parameterDefinitions(models.find(m => m.id === resolved.id)).find(p => p.id === 'fast');
  const switchable = ['false', 'true'].every(value => fastParameter?.values.some(v => v.value === value));
  if (fast === true && !switchable) throw new ProviderError('INVALID_PARAMETER', 'Model declares no switchable Fast parameter');
  if (switchable) params.fast = String(fast ?? (params.fast === 'true'));

  const entry = models.find(m => m.id === resolved.id);
  const choices = contextChoices(entry);
  if (choices.length && (budget !== undefined || params.context === undefined)) {
    const choice = budget === undefined ? choices.at(-1) : choices.find(p => p.tokens >= budget);
    if (!choice) throw new ProviderError('INVALID_PARAMETER', 'Context budget exceeds the largest declared Cursor context window');
    params.context = choice.value;
  }
  if (effort !== undefined) {
    const parameter = reasoningParameter(models.find(m => m.id === resolved.id));
    if (!parameter) throw new ProviderError('INVALID_PARAMETER', 'Model declares no reasoning effort parameter');
    if (params[parameter.id] !== undefined && params[parameter.id] !== effort) throw new ProviderError('INVALID_PARAMETER', 'Reasoning effort conflicts with model variant');
    params[parameter.id] = effort;
    resolveVariant(resolved.id + '@' + Object.entries(params).map(([k,v]) => `${k}=${v}`).join(','), sdkCatalog(models));
  }
  const variants = models.find(m => m.id === resolved.id)?.variants ?? [];
  const compatible = variants.filter(v => Object.entries(params).every(([key, value]) => v.params.some(p => p.id === key && p.value === value)));
  return { id: resolved.id, params: Object.entries(params).map(([id, value]) => ({ id, value })),
    ...(compatible.length && compatible.every(v => v.isMaxMode === true) ? { maxMode: true } : {}),
  };
}

/** Dependency-injected to exercise the exact DSH stream mapping without a live profile. */
export function defineAdapter({ LlmAdapter, transport, profile, credential, validate, attachments = () => undefined, offloadedImageText }) {
  return class CursorAdapter extends LlmAdapter {
    providerInfo() { return { id: 'cursor', name: 'Cursor' }; }
    async account(signal) { return transport.catalog(await credential(), signal); }
    async listModels() {
      const models = await this.account();
      const available = models.map(m => ({ provider: 'cursor', id: m.id, name: m.displayName }));
      const selected = profile().models;
      if (selected === undefined) return available;
      return selected.filter(value => !(typeof value === 'string' ? value : value.id).includes('@')).map(value => {
        const item = typeof value === 'string' ? { id: value } : value;
        modelSelection(item.id, models);
        const known = available.find(m => m.id === item.id);
        return { ...(known ?? { provider:'cursor', id:item.id }), name:item.name || known?.name || item.id, ...(item.inputModalities ? {inputModalities:[...item.inputModalities]} : {}) };
      });
    }
    async resolveModel(provider, model, signal) {
      const catalog = await this.account(signal);
      const selection = modelSelection(model, catalog);
      const entry = catalog.find(m => m.id === selection.id);
      const efforts = reasoningParameter(entry)?.values;
      const custom = profile().models?.find(value => typeof value === 'object' && value.id === model);
      const budget = custom ? custom.contextWindow : profile().contextWindow;
      modelSelection(model, catalog, undefined, custom?.fast ?? false, budget);
      const contextWindow = budget ?? (selection.params.find(p => p.id === 'context') ? contextChoices(entry).find(p => p.value === selection.params.find(p => p.id === 'context').value)?.tokens : undefined);
      return { provider, id: model, name: custom?.name || entry.displayName,
        ...(custom?.inputModalities ? { inputModalities: [...custom.inputModalities] } : {}),
        ...(contextWindow ? { context: { contextWindow } } : {}),
        ...(efforts?.length ? { reasoning: { efforts: efforts.map(v => ({ id: v.value, name: v.displayName ?? v.value })) } } : {}),
      };
    }
    async *stream(options) {
      let index = 0, hasContent = false, calls = 0, open;
      const attempts = [], usage = [];
      const close = function* () {
        if (!open) return;
        yield { type: 'block-end', index: open.index, block: { type: open.type, text: open.text } };
        open = undefined;
      };
      const block = function* (event) {
        if (event.type === 'tool-call') {
          yield* close();
          const current = index++;
          calls++; hasContent = true;
          yield { type: 'block-start', index: current, blockType: 'tool-call' };
          yield { type: 'tool-call-delta', index: current, id: event.id, name: event.name, argumentsDelta: event.arguments };
          yield { type: 'block-end', index: current, block: { ...event } };
        } else if (event.text) {
          hasContent = true;
          const type = event.type === 'reasoning' ? 'reasoning' : 'text';
          if (open?.type !== type) {
            yield* close();
            open = { type, index: index++, text: '' };
            yield { type: 'block-start', index: open.index, blockType: type };
          }
          open.text += event.text;
          yield { type: type === 'reasoning' ? 'reasoning-delta' : 'text-delta', index: open.index, text: event.text };
        }
      };
      try {
        if (options.temperature !== undefined || options.maxTokens !== undefined || options.stop !== undefined) throw new ProviderError('UNSUPPORTED_CONTROL', 'Cursor SDK does not expose temperature/maxTokens/stop controls');
        // SDK catalog has no per-model vision metadata: leave modalities unknown.
        for (const m of options.messages) for (const b of m.content) {
          if (!['text', 'reasoning', 'tool-call', 'image'].includes(b.type)) throw new ProviderError('UNSUPPORTED_CONTENT', 'Unsupported Cursor conversation content');
        }
        const projected = await imagePrompt(options, { attachments: attachments(), offloadedImageText });
        const apiKey = await credential();
        const catalog = await transport.catalog(apiKey, options.signal);
        const configured = profile().models?.find(value => typeof value === 'object' && value.id === options.model);
        const model = modelSelection(options.model, catalog, options.reasoningEffort, configured?.fast ?? false, configured ? configured.contextWindow : profile().contextWindow);
        const imageNote = projected.images.length ? '\nImages attached to this request are numbered from 1 in occurrence order. Each JSON image block sdkImage value identifies its attached image; respect its owning message role and position.\n' : '\n';
        const text = 'Use registered native tools for actions, never prose tool envelopes. DSH owns tool execution and approval. The following JSON is conversation data in role order.' + imageNote + JSON.stringify({ system: options.system, messages: projected.messages, toolHistory: options.toolHistory });
        const previous = [...options.messages].reverse().find(message => message.role === 'assistant');
        const continuation = previous?.source?.replayState?.response?.protocol === 'cursor-native-v1' ? previous.source.replayState.response.continuation : undefined;
        const prompt = projected.images.length ? { text, images: projected.images } : text;
        const record = {}; attempts.push(record);
        const nativeMessages = projected.messages.map(message => message.role === 'tool' ? { ...message, content: message.content.map(block => block.type === 'image' && block.sdkImage ? { ...block, sdkData: projected.images[block.sdkImage - 1] } : block) } : message);
        for await (const event of transport.stream({ apiKey, model, prompt, signal: options.signal, tools: options.tools ?? [], validate, continuation, messages: nativeMessages, sessionId: options.sessionId, purpose: options.purpose, toolHistory: options.toolHistory, system: options.system })) {
          if (['text', 'reasoning', 'tool-call'].includes(event.type)) yield* block(event);
          else if (event.type === 'usage') usage.push(event.billing);
          else if (event.type === 'diagnostic') record.upstream = event.summary;
          else if (event.type === 'continuation') record.continuation = event.token;
        }
        yield* close();
        if (!hasContent) throw new ProviderError('EMPTY_RESPONSE', 'Cursor returned no content');
        if (usage.length) yield { type: 'usage', usage: summarizeUsage(usage).billing };
        yield { type: 'finish', reason: { kind: calls ? 'tool-calls' : 'stop' }, replayState: { response: { protocol: 'cursor-native-v1', ...(attempts[0]?.continuation ? { continuation: attempts[0].continuation } : {}), attempts } } };
      } catch (error) {
        yield* close();
        // SDK error text can contain credential-bearing URLs; never forward it.
        const code = options.signal?.aborted ? 'ABORTED' : error instanceof ProviderError ? error.code : 'CURSOR_SDK_ERROR';
        if (usage.length) yield { type: 'usage', usage: summarizeUsage(usage).billing };
        yield { type: 'finish', replayState: { response: { protocol: 'cursor-native-v1', ...(attempts[0]?.continuation ? { continuation: attempts[0].continuation } : {}), attempts } }, reason: { kind: code === 'ABORTED' ? 'aborted' : 'error', failure: { code, message: error instanceof ProviderError ? error.message : 'Cursor SDK request failed; no credential details were logged' } } };
      }
    }
  };
}
