import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const [name, expected] of [['Grok 4.7', 'Cursor Grok 4.7'], ['Cursor Grok 4.7', 'Cursor Grok 4.7'], [undefined, 'Cursor grok-4.7']]) {
  test(`fetch and adopt initializes display name: ${String(name)}`, async () => {
    let entry, renderer, cursor = 0, saved;
    const values = [];
    const snapshot = { status: 'ready', writable: true, revision: 1, value: { providers: { cursor: { models: [{ id: 'existing', name: 'My existing model' }] } } } };
    const scope = { getSnapshot: () => snapshot, subscribe: () => () => {}, async mutate(ops) { saved = ops.find(op => op.path.at(-1) === 'models')?.value; snapshot.value.providers.cursor.models = saved; snapshot.revision++; return true; } };
    const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useSyncExternalStore: (_s, get) => get(), useEffect() {}, useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; } };
    const ctx = { locale: { getLocale: () => ({ active: 'zh' }), register() {}, bind: () => k => k, subscribe: () => () => {}, getSnapshot: () => ({}) }, remote: { llm: { async discoverModels() { return { ok: true, value: [{ id: 'existing', name: 'Upstream existing' }, { id: 'grok-4.7', name }] }; } } }, effect: fn => fn(), inject: (_d, fn) => fn(ctx), configForms: { get: () => scope, whileServed: (_n, fn) => fn() }, slots: { inject: (_s, fn) => fn(), register: (_o, fn) => { renderer = fn; return () => {}; } } };
    vm.runInNewContext(readFileSync('src/client.js', 'utf8'), { window: { __ModuleLoader__: { load: v => { entry = v; } } } });
    entry.factory(() => React).apply(ctx);
    const render = () => { cursor = 0; const el = renderer({ view: 'page', useRemoteAccess: () => true }); return el.type(el.props); };
    const nodes = n => [n, ...(n.children || []).flat(Infinity).filter(x => x && typeof x === 'object').flatMap(nodes)];
    const button = label => nodes(render()).find(n => n.type === 'button' && n.children.flat(Infinity).includes(label));
    const field = label => nodes(render()).find(n => n.props['aria-label'] === label);
    await button('fetchModels').props.onClick();
    const candidate = nodes(render()).find(n => n.type === 'input' && n.props.type === 'checkbox' && !n.props.checked);
    assert.ok(candidate, 'new catalog model is selectable');
    candidate.props.onChange({ target: { checked: true } });
    button('fetchAdopt').props.onClick();
    assert.equal(field('modelId 2').props.value, 'grok-4.7');
    assert.equal(field('modelName 2').props.value, expected);
    assert.equal(field('modelName 1').props.value, 'My existing model');
    await nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(saved[1].name, expected);
    field('modelName 2').props.onChange({ target: { value: 'My edited name' } });
    await nodes(render()).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
    assert.equal(saved[1].name, 'My edited name');
  });
}
