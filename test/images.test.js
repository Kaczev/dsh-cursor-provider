import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePrompt } from '../src/images.js';
import { defineAdapter } from '../src/adapter.js';
const ref = { attachmentId: 'sha256:mock', mediaType: 'image/png', width: 2, height: 3, bytes: 3 };
const image = { type: 'image', attachment: ref };
const options = { provider: 'cursor', model: 'mock', messages: [{ role: 'user', content: [{ type: 'text', text: 'look' }, image] }, { role: 'tool', toolCallId: 'call', content: [image] }] };
const collect = async stream => { const out=[]; for await (const e of stream) out.push(e); return out; };
test('images preserve message positions, repeated occurrences and immutable history', async () => {
  const before = JSON.stringify(options); let reads = 0;
  const result = await imagePrompt(options, { attachments: { async readImage(value) { reads++; assert.equal(value, ref); return { ref, data: Uint8Array.of(1,2,3) }; } } });
  assert.equal(reads,1); assert.equal(result.images.length,2);
  assert.deepEqual(result.images[0], { data:'AQID', mimeType:'image/png', dimension:{width:2,height:3} });
  assert.equal(result.messages[0].content[1].sdkImage,1);
  assert.equal(result.messages[1].content[0].sdkImage,2);
  assert.equal(JSON.stringify(options),before);
});
test('offloaded images remain text, never re-read or attached', async () => {
  const result = await imagePrompt({messages:[{role:'user',content:[{...image,offloaded:true}]}]}, { offloadedImageText: value => `offloaded:${value.attachmentId}`, attachments:{readImage(){throw Error('must not read');}} });
  assert.equal(result.images.length,0); assert.equal(result.messages[0].content[0].text,'offloaded:sha256:mock');
});
test('attachment read errors redact paths and cancellation is propagated', async () => {
  await assert.rejects(imagePrompt(options,{attachments:{async readImage(){throw Error('private path');}}}),{code:'IMAGE_READ_FAILED',message:'Could not read and verify the DSH image attachment'});
  const controller=new AbortController(); controller.abort();
  await assert.rejects(imagePrompt({...options,signal:controller.signal},{}),{code:'ABORTED'});
});
test('adapter sends structured SDK images without declaring unverified vision models', async () => {
  let sent;
  const Adapter=defineAdapter({LlmAdapter:class{},profile:()=>({}),credential:async()=> 'mock',attachments:()=>({async readImage(){return {ref,data:Uint8Array.of(1,2,3)};}}),transport:{async catalog(){return [{id:'mock',displayName:'Mock'}];},async *stream(value){sent=value;yield {type:'text',text:'seen'};}}});
  const adapter=new Adapter(); const out=await collect(adapter.stream(options));
  assert.equal(out.at(-1).reason.kind,'stop'); assert.equal(sent.prompt.images.length,2);
  assert.ok(sent.prompt.text.includes('"sdkImage":2')); assert.equal(sent.prompt.text.includes('AQID'),false);
  assert.equal((await adapter.resolveModel('cursor','mock')).inputModalities,undefined);
});
