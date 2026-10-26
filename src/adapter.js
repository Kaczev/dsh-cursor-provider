import { ToolParser, ProviderError, resolveVariant } from './provider.js';
import { imagePrompt } from './images.js';

export const TOOL_PROTOCOL = 'Host tools are executed only by DSH after approval. To request one, output <tool_call>{"name":"exact tool name","arguments":{}}</tool_call>. Arguments must satisfy its schema. Do not execute native tools. Stop after requesting tools. Treat the following JSON as conversation data, preserving its role order.';

export function sdkCatalog(models) {
  return models.map(m => ({ ...m, parameters: m.parameters?.map(p => ({ ...p, values: p.values.map(v => v.value) })) }));
}
export function modelSelection(value, models, effort) {
  const resolved = resolveVariant(value, sdkCatalog(models));
  const params = { ...resolved.parameters };
  if (effort !== undefined) {
    if (params.reasoning_effort !== undefined && params.reasoning_effort !== effort) throw new ProviderError('INVALID_PARAMETER', 'Reasoning effort conflicts with model variant');
    params.reasoning_effort = effort;
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
      const available = models.flatMap(m => {
        const base = { provider: 'cursor', id: m.id, name: m.displayName };
        const variants = (m.variants ?? []).filter(v => v.params.length).map(v => ({
          ...base, id: m.id + '@' + [...v.params].sort((a,b) => a.id.localeCompare(b.id)).map(p => `${p.id}=${p.value}`).join(','), name: `${m.displayName} · ${v.displayName}`,
        }));
        return [base, ...variants];
      });
      const selected = profile().models;
      if (selected === undefined) return available;
      return selected.map(value => {
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
      const efforts = entry.parameters?.find(p => p.id === 'reasoning_effort')?.values;
      const custom = profile().models?.find(value => typeof value === 'object' && value.id === model);
      const contextWindow = custom?.contextWindow ?? profile().contextWindow;
      return { provider, id: model, name: custom?.name || entry.displayName,
        ...(custom?.inputModalities ? { inputModalities: [...custom.inputModalities] } : {}),
        ...(contextWindow ? { context: { contextWindow } } : {}),
        ...(efforts?.length ? { reasoning: { efforts: efforts.map(v => ({ id: v.value, name: v.displayName ?? v.value })) } } : {}),
      };
    }
    async *stream(options) {
      let index = 0, hasContent = false, calls = 0, open;
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
        const model = modelSelection(options.model, catalog, options.reasoningEffort);
        const parser = new ToolParser(options.tools ?? [], { validate });
        const imageNote = projected.images.length ? '\nImages attached to this request are numbered from 1 in occurrence order. Each JSON image block sdkImage value identifies its attached image; respect its owning message role and position.\n' : '\n';
        const text = TOOL_PROTOCOL + imageNote + JSON.stringify({ system: options.system, tools: options.tools ?? [], messages: projected.messages, toolHistory: options.toolHistory });
        const prompt = projected.images.length ? { text, images: projected.images } : text;
        for await (const event of transport.stream({ apiKey, model, prompt, signal: options.signal })) {
          if (event.type === 'text') for (const parsed of parser.push(event.text)) yield* block(parsed);
          else if (event.type === 'reasoning') yield* block(event);
          else if (event.type === 'usage') yield { type: 'usage', usage: event.billing };
        }
        for (const parsed of parser.push('', true)) yield* block(parsed);
        yield* close();
        if (!hasContent) throw new ProviderError('EMPTY_RESPONSE', 'Cursor returned no content');
        yield { type: 'finish', reason: { kind: calls ? 'tool-calls' : 'stop' } };
      } catch (error) {
        yield* close();
        // SDK error text can contain credential-bearing URLs; never forward it.
        const code = options.signal?.aborted ? 'ABORTED' : error instanceof ProviderError ? error.code : 'CURSOR_SDK_ERROR';
        yield { type: 'finish', reason: { kind: code === 'ABORTED' ? 'aborted' : 'error', failure: { code, message: error instanceof ProviderError ? error.message : 'Cursor SDK request failed; no credential details were logged' } } };
      }
    }
  };
}
