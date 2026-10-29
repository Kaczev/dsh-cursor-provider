import test from 'node:test';
import assert from 'node:assert/strict';
import {contextChoices,modelSelection,defineAdapter} from '../src/adapter.js';
const models=[{id:'mock',displayName:'Mock',parameters:[{id:'context',values:[{value:'500K'},{value:'250k'}]}]}, {id:'default',displayName:'Default'}];
test('context choices sort numeric values and round budget up without changing DSH budget',async()=>{
 assert.deepEqual(contextChoices(models[0]).map(p=>p.tokens),[250000,500000]);
 for(const [budget,expected] of [[undefined,'500K'],[149000,'250k'],[150000,'250k'],[250000,'250k'],[350000,'500K'],[500000,'500K']]){
  assert.equal(modelSelection('mock',models,undefined,false,budget).params.find(p=>p.id==='context').value,expected);
  let request;const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>({models:[{id:'mock',...(budget?{contextWindow:budget}:{})}]}),credential:async()=> 'test-only',transport:{catalog:async()=>models,async *stream(r){request=r;yield {type:'text',text:'ok'};}}});
  const adapter=new Adapter();for await(const chunk of adapter.stream({provider:'cursor',model:'mock',messages:[]})) assert.notEqual(chunk.reason?.kind,'error');
  assert.equal(request.model.params.find(p=>p.id==='context').value,expected);
  assert.equal((await adapter.resolveModel('cursor','mock')).context.contextWindow,budget??500000);
 }
 assert.throws(()=>modelSelection('mock',models,undefined,false,500001),{code:'INVALID_PARAMETER'});
});
test('no context leaves SDK untouched while manual host budget remains effective',async()=>{
 assert.deepEqual(modelSelection('default',models,undefined,false,350000).params,[]);
 const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>({models:[{id:'default',contextWindow:350000}]}),credential:async()=> 'test-only',transport:{catalog:async()=>models}});
 assert.equal((await new Adapter().resolveModel('cursor','default')).context.contextWindow,350000);
 assert.deepEqual((await new Adapter().listModels()).map(m=>m.id),['default']);
});
test('variant-only context and malformed declarations never invent numeric capacities',()=>{
 const model={id:'v',variants:[{params:[{id:'context',value:'1m'}]},{params:[{id:'context',value:'250k'}]},{params:[{id:'context',value:'auto'}]}]};
 assert.deepEqual(contextChoices(model).map(p=>p.tokens),[250000,1000000]);
 assert.equal(modelSelection('v',[model],undefined,false,350000).params[0].value,'1m');
});
