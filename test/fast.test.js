import test from 'node:test';
import assert from 'node:assert/strict';
import {modelSelection,defineAdapter} from '../src/adapter.js';
import {Config} from '../src/index.js';
const models=[{id:'mock',displayName:'Mock',parameters:[{id:'fast',values:[{value:'true'},{value:'false'}]}]}];
test('Fast defaults off regardless of upstream first value; explicit variants and settings work',()=>{
 assert.deepEqual(modelSelection('mock',models).params,[{id:'fast',value:'false'}]);
 assert.deepEqual(modelSelection('mock',models,undefined,true).params,[{id:'fast',value:'true'}]);
 assert.deepEqual(modelSelection('mock@fast=true',models,undefined,false).params,[{id:'fast',value:'false'}]);
 assert.deepEqual(modelSelection('mock@fast=true',models).params,[{id:'fast',value:'true'}]);
 assert.throws(()=>modelSelection('other',[{id:'other'}],undefined,true),{code:'INVALID_PARAMETER'});
 assert.deepEqual(modelSelection('other',[{id:'other'}]).params,[]);
});
test('saved Fast option reaches SDK request and retains local budget',async()=>{
 const cfg=Config({providers:{cursor:{models:[{id:'mock',fast:true,fastNameAuto:true,name:'Mock Fast',contextWindow:12345}]}}});
 const profile=()=>cfg.providers.get().cursor;let request;
 const Adapter=defineAdapter({LlmAdapter:class{},profile,credential:async()=> 'synthetic',transport:{catalog:async()=>models,async *stream(r){request=r;yield {type:'text',text:'ok'};}}});
 const a=new Adapter();for await(const chunk of a.stream({provider:'cursor',model:'mock',messages:[]})){}
 assert.equal(request.model.params[0].value,'true');
 assert.equal((await a.resolveModel('cursor','mock')).context.contextWindow,12345);
 assert.equal(profile().models[0].fastNameAuto,true);
});
test('explicit unknown capacity does not fall back to a global budget',async()=>{
 const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>({contextWindow:999999,models:[{id:'mock'}]}),credential:async()=> 'synthetic',transport:{catalog:async()=>models}});
 assert.equal((await new Adapter().resolveModel('cursor','mock')).context,undefined);
});
