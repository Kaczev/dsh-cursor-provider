import test from 'node:test';
import assert from 'node:assert/strict';
import {Context, Service} from '@deepseek-ai/cordis';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('real Cordis rejects namespace-only injection when reading remote root',async()=>{
  const root=new Context();
  const provider=root.plugin({apply(ctx){new Service(ctx,'remote');new Service(ctx,'remote.llm');}});
  await provider.await();
  let rejected=false;
  const old=root.plugin({inject:['remote.llm'],apply(ctx){try{void ctx.remote;}catch(e){rejected=/without inject/.test(e.message);}}});
  await old.await();
  assert.equal(rejected,true);
  let entry;
  vm.runInNewContext(readFileSync('src/client.js','utf8'),{window:{__ModuleLoader__:{load:e=>{entry=e;}}}});
  const exported=entry.factory(()=>({}));
  assert.ok(exported.inject.includes('remote'));
  let available=false;
  const current=root.plugin({inject:Array.from(exported.inject).filter(x=>['remote','remote.llm'].includes(x)),apply(ctx){available=!!ctx.remote;}});
  await current.await();
  assert.equal(available,true);
  await current.dispose();
  await old.dispose();
  await provider.dispose();
});
