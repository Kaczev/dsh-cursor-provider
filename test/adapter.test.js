import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { defineAdapter, modelSelection } from '../src/adapter.js';
const catalog = [{ id: 'mock', displayName: 'Mock', parameters: [{ id: 'reasoning_effort', values: [{ value: 'high' }] }], variants: [{ displayName: 'High', params: [{ id: 'reasoning_effort', value: 'high' }] }] }];
const collect = async src => { const out = []; for await (const e of src) out.push(e); return out; };
function fixture(events = [{ type: 'text', text: 'ok' }]) {
  const calls = [];
  const ajv = new Ajv();
  const Adapter = defineAdapter({ LlmAdapter: class {}, profile: () => ({}), credential: async () => 'mock-only', validate: (schema, args) => ajv.validate(schema, args),
    transport: { catalog: async () => catalog, async *stream(options) { calls.push(options); yield* (typeof events === 'function' ? events(calls.length) : events); } } });
  return { adapter: new Adapter(), calls };
}
test('catalog reasoning aliases retain upstream IDs in metadata and stream requests', async () => {
  for (const id of ['reasoning_effort', 'effort', 'reasoning']) {
    const models = [{id:'alias',displayName:'Alias',parameters:[{id,values:[{value:'high',displayName:'High'},{value:'max',displayName:'Max'}]}],
      variants:[{displayName:'High',params:[{id,value:'high'}]},{displayName:'Max',params:[{id,value:'max'}],isMaxMode:true}]}];
    const calls=[];
    const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>({}),credential:async()=> 'mock',
      transport:{catalog:async()=>models,async *stream(request){calls.push(request);yield {type:'text',text:'ok'};}}});
    const adapter=new Adapter();
    assert.deepEqual((await adapter.resolveModel('cursor','alias')).reasoning.efforts,[{id:'high',name:'High'},{id:'max',name:'Max'}]);
    const out=await collect(adapter.stream({...options,model:'alias',reasoningEffort:'max'}));
    assert.equal(out.at(-1).reason.kind,'stop');
    assert.deepEqual(calls[0].model,{id:'alias',params:[{id,value:'max'}],maxMode:true});
    assert.throws(()=>modelSelection(`alias@${id}=high`,models,'max'),{code:'INVALID_PARAMETER'});
    assert.throws(()=>modelSelection('alias',models,'invalid'),{code:'INVALID_PARAMETER'});
  }
});
test('text deltas share one block and preserve actual newlines', async () => {
  const {adapter}=fixture([{type:'text',text:'hello '},{type:'text',text:'world\n'},{type:'text',text:'again'}]);
  const out=await collect(adapter.stream(options));
  assert.equal(out.filter(e=>e.type==='block-start').length,1);
  assert.equal(out.filter(e=>e.type==='block-end').length,1);
  assert.equal(out.find(e=>e.type==='block-end').block.text,'hello world\nagain');
  assert.equal(out.at(-1).reason.kind,'stop');
});
test('explicit empty catalog stays empty and custom metadata only controls host budget', async () => {
  let config={models:[]};
  const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>config,credential:async()=> 'mock-only',transport:{catalog:async()=>catalog}});
  const adapter=new Adapter();
  assert.deepEqual(await adapter.listModels(),[]);
  config={models:[{id:'mock',name:'My model',contextWindow:12345}]};
  assert.equal((await adapter.listModels())[0].name,'My model');
  const info=await adapter.resolveModel('cursor','mock');
  assert.equal(info.name,'My model');assert.equal(info.context.contextWindow,12345);
  assert.equal(info.defaultMaxTokens,undefined);assert.equal(info.inputModalities,undefined);
  config={models:['mock']};assert.equal((await adapter.listModels()).length,1);
});
test('configured text and image modalities reach both model metadata APIs', async () => {
  for (const inputModalities of [['text'],['image'],['text','image']]) {
    const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>({models:[{id:'mock',inputModalities}]}),credential:async()=> 'mock',transport:{catalog:async()=>catalog}});
    const adapter=new Adapter();
    assert.deepEqual((await adapter.resolveModel('cursor','mock')).inputModalities,inputModalities);
    assert.deepEqual((await adapter.listModels())[0].inputModalities,inputModalities);
  }
});
const options = { provider: 'cursor', model: 'mock', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] };
test('SDK object-valued parameter definitions and variants map without invented capabilities', async () => {
  assert.deepEqual(modelSelection('mock@reasoning_effort=high', catalog), { id: 'mock', params: [{ id: 'reasoning_effort', value: 'high' }] });
  assert.throws(() => modelSelection('mock', catalog, 'low'), { code: 'INVALID_PARAMETER' });
  const { adapter } = fixture();
  assert.equal((await adapter.listModels()).length, 2);
  const info = await adapter.resolveModel('cursor', 'mock');
  assert.equal(info.context, undefined);
  assert.deepEqual(info.reasoning.efforts, [{ id: 'high', name: 'high' }]);
});
test('variant-only efforts are exposed and accepted by the request path without mutating catalog', async () => {
  const models = [{ id: 'variant-only', displayName: 'Variant only', variants: [
    { displayName: 'Low', params: [{ id: 'reasoning_effort', value: 'low' }] },
    { displayName: 'High', params: [{ id: 'reasoning_effort', value: 'high' }], isMaxMode: true },
  ] }];
  const original = JSON.stringify(models);
  const calls = [];
  const Adapter = defineAdapter({ LlmAdapter: class {}, profile: () => ({}), credential: async () => 'mock',
    transport: { catalog: async () => models, async *stream(request) { calls.push(request); yield {type:'text',text:'ok'}; } } });
  const adapter = new Adapter();
  assert.deepEqual((await adapter.resolveModel('cursor','variant-only')).reasoning.efforts,
    [{id:'low',name:'low'},{id:'high',name:'high'}]);
  assert.deepEqual(modelSelection('variant-only',models,'high'),
    {id:'variant-only',params:[{id:'reasoning_effort',value:'high'}],maxMode:true});
  const out = await collect(adapter.stream({...options,model:'variant-only',reasoningEffort:'high'}));
  assert.equal(out.at(-1).reason.kind,'stop');
  assert.equal(calls[0].model.params[0].value,'high');
  assert.throws(()=>modelSelection('variant-only',models,'invented'),{code:'INVALID_PARAMETER'});
  assert.throws(()=>modelSelection('variant-only@reasoning_effort=low',models,'high'),{code:'INVALID_PARAMETER'});
  assert.equal(JSON.stringify(models),original);
});
test('merge variant values while preserving explicit labels and never invent efforts', async () => {
  const models = [
    {id:'mixed',displayName:'Mixed',parameters:[{id:'reasoning_effort',values:[{value:'high',displayName:'High effort'}]}],
      variants:[{displayName:'Duplicate',params:[{id:'reasoning_effort',value:'high'}]},{displayName:'Low',params:[{id:'reasoning_effort',value:'low'}]}]},
    {id:'plain',displayName:'Plain',variants:[{displayName:'Default',params:[]}]},
  ];
  const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>({}),credential:async()=> 'mock',transport:{catalog:async()=>models}});
  const adapter=new Adapter();
  assert.deepEqual((await adapter.resolveModel('cursor','mixed')).reasoning.efforts,
    [{id:'high',name:'High effort'},{id:'low',name:'low'}]);
  assert.equal((await adapter.resolveModel('cursor','plain')).reasoning,undefined);
});
test('DSH text and tool blocks finish exactly once, raw JSON preserved', async () => {
  const { adapter, calls } = fixture([{ type: 'tool-call', id: 'native-1', name: 'safe', arguments: '{"n":1}' }, { type: 'usage', billing: { inputTokens: 10, outputTokens: 2 } }]);
  const tools = [{ name: 'safe', description: 'safe mock', parameters: { type: 'object', properties: { n: { type: 'integer' } }, required: ['n'], additionalProperties: false } }];
  const out = await collect(adapter.stream({ ...options, tools }));
  assert.equal(out.filter(e => e.type === 'finish').length, 1);
  assert.equal(out.at(-1).reason.kind, 'tool-calls');
  assert.equal(out.find(e => e.type === 'tool-call-delta').argumentsDelta, '{"n":1}');
  assert.ok(calls[0].prompt.includes(JSON.stringify(options.messages)));
});
test('unsupported controls and attachments reject before inference', async () => {
  for (const change of [{ temperature: 0.5 }, { maxTokens: 100 }, { stop: ['end'] }, { messages: [{ role: 'user', content: [{ type: 'image', attachment: {} }] }] }]) {
    const { adapter, calls } = fixture();
    const out = await collect(adapter.stream({ ...options, ...change }));
    assert.equal(out.at(-1).reason.kind, 'error'); assert.equal(calls.length, 0);
  }
});
test('successful replies do not store raw parse diagnostics', async () => {
  const { adapter } = fixture();
  const out = await collect(adapter.stream(options));
  assert.equal(out.at(-1).replayState.response.attempts[0].parseFailure, undefined);
});

test('SDK failures redact upstream error details', async () => {
  const { adapter } = fixture();
  adapter.account = async () => catalog;
  const Adapter = defineAdapter({ LlmAdapter: class {}, profile: () => ({}), credential: async () => { throw new Error('secret-in-url'); }, transport: {}, validate: () => true });
  const out = await collect(new Adapter().stream(options));
  assert.equal(JSON.stringify(out).includes('secret-in-url'), false);
  assert.equal(out.at(-1).reason.failure.code, 'CURSOR_SDK_ERROR');
});
