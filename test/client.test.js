import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('client registers only the official bundle configuration slot with owned cleanup', () => {
  let module, registration, watch;
  const dict = {};
  const ctx = {
    locale: { register(ns, values) { dict[ns] = values; }, bind() { return k => k; } },
    inject(deps, callback) { assert.deepEqual(Array.from(deps), ['configForms']); callback(ctx); },
    effect(callback) { callback(); },
    configForms: { whileServed(names, callback) { watch = Array.from(names); callback(); return () => {}; }, get() {} },
    slots: { inject(name, callback) { assert.equal(name,'plugins.bundle.config'); return callback(); }, register(options) { registration = options; return () => {}; } },
  };
  vm.runInNewContext(readFileSync('src/client.js','utf8'), { window: { __ModuleLoader__: { load(value) { module = value; } } } });
  assert.equal(module.id, 'dsh-cursor-provider');
  module.factory(() => ({ createElement() {} })).apply(ctx);
  assert.deepEqual(watch,['cursor-provider']);
  assert.equal(registration.key,'dsh-cursor-provider');
  assert.ok(dict['cursor-provider'].zh.key);
  assert.ok(dict['cursor-provider'].en.key);
});
