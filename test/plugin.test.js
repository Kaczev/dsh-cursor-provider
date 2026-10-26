import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, apply, grokCatalogDiagnostic } from '../src/index.js';
import { LlmAdapter, BlockAssembler } from '@deepseek-ai/dsh-llm';
import { defineAdapter } from '../src/adapter.js';

test('Grok diagnostic includes only the requested catalog fields', () => {
  const diagnostic = grokCatalogDiagnostic([
    { id: 'other', parameters: [{ id: 'ignored' }], variants: [{ displayName: 'ignored' }] },
    { id: 'grok-4.6', parameters: [{ id: 'reasoning_effort', values: [{ value: 'custom' }] }], variants: [{ displayName: 'Custom', params: [{ id: 'reasoning_effort', value: 'custom' }] }], apiKey: 'must-not-leak' },
  ]);
  assert.deepEqual(diagnostic, {
    id: 'grok-4.6',
    parameters: [{ id: 'reasoning_effort', values: [{ value: 'custom' }] }],
    variants: [{ displayName: 'Custom', params: [{ id: 'reasoning_effort', value: 'custom' }] }],
  });
  assert.equal(grokCatalogDiagnostic([{ id: 'other' }]), undefined);
});

test('model display names save alongside legacy rows without input declarations', () => {
  const config=Config({providers:{cursor:{models:[{id:'grok-4.7',name:'My Grok'},{id:'grok-4.6'}]}}});
  const models=config.providers.get().cursor.models;
  assert.equal(models[0].name,'My Grok');
  assert.equal(models[1].inputModalities,undefined);
  for (const inputModalities of [['text'],['image'],['text','image']]) {
    const value=Config({providers:{cursor:{models:[{id:'mock',name:'Named',inputModalities}]}}});
    assert.deepEqual(value.providers.get().cursor.models[0].inputModalities,inputModalities);
  }
  assert.throws(()=>Config({providers:{cursor:{models:[{id:'mock',inputModalities:[]}]}}}));
});

test('real Schemastery configuration and native provider registrations', async () => {
  const config = Config({ providers: { cursor: { apiKeyEnv: 'CURSOR_TEST_ONLY' } } });
  assert.equal(config.providers.get().cursor.apiKeyEnv, 'CURSOR_TEST_ONLY');
  let directory, adapter, discovery, disposer;
  const ctx = { fiber: { entry: { options: { id: 'cursor-provider' } } },
    inject: () => {}, effect: setup => { disposer = setup(); }, logger: { warn: () => {} },
    credentials: { resolve: async () => undefined },
    llm: {
      registerConfigurableProviders: entries => { directory = entries; },
      registerAdapter: (routes, instance) => { assert.deepEqual(routes, ['cursor']); adapter = instance; },
      registerModelDiscovery: (ns, fn) => { assert.equal(ns, 'cursor-provider'); discovery = fn; },
    },
  };
  apply(ctx, config);
  assert.equal(directory, undefined);
  assert.ok(adapter instanceof LlmAdapter);
  await assert.rejects(discovery({ provider: 'other' }), { code: 'INVALID_PROVIDER' });
  await assert.rejects(discovery({ baseURL: 'https://invalid.example' }), { code: 'UNSUPPORTED_ENDPOINT' });
  await assert.rejects(adapter.listModels(), { code: 'MISSING_CREDENTIAL' });
  await disposer();
});

test('real DSH BlockAssembler accepts adapter chunks', async () => {
  const Adapter = defineAdapter({ LlmAdapter, profile: () => ({}), credential: async () => 'mock-only', validate: () => true,
    transport: { catalog: async () => [{ id: 'mock', displayName: 'Mock' }], async *stream() { yield { type: 'text', text: 'hello' }; } },
  });
  const assembler = new BlockAssembler();
  const chunks = [];
  for await (const chunk of new Adapter().stream({ provider: 'cursor', model: 'mock', messages: [] })) chunks.push(chunk);
  assert.equal(chunks.at(-1).reason.kind, 'stop');
  for (const chunk of chunks) assembler.push(chunk);
  assert.equal(assembler.finish.kind, 'stop');
  assert.equal(assembler.blocks()[0].text, 'hello');
});
