window.__ModuleLoader__.load({ id: '@local/dsh-cursor-provider', factory(require) {
  const React = require('react'), h = React.createElement;
  return { inject: ['slots', 'locale', 'remote', 'remote.credentials', 'remote.llm'], apply(ctx) {
    const ns = 'cursor-provider';
    ctx.locale.register(ns, { zh: { title:'Cursor 配置', sdk:'Cursor 官方 SDK · @cursor/sdk', key:'API 密钥', hint:'留空保留已有密钥。仅写入 DSH 凭据服务，不写入配置或日志。', models:'模型目录', load:'获取可用模型', save:'保存配置', busy:'处理中…', saved:'配置已保存', fail:'操作失败，请检查权限、密钥或配置版本后重试。', empty:'尚未获取目录；未勾选时使用账号完整目录。', help:'勾选要在 DSH 中显示的模型；在会话输入栏选择实际使用的模型。', boundary:'支持文字和图片输入类型配置，不支持自定义 API 地址。工具执行与审批仍由 DSH 负责。SDK 未发送 DSH 归属标头。', loading:'配置加载中或不可用', endpoint:'接入方式' }, en: { title:'Cursor settings', sdk:'Official Cursor SDK · @cursor/sdk', key:'API key', hint:'Leave blank to keep the stored key. Saved only through DSH credentials, never in settings or logs.', models:'Model catalog', load:'Fetch available models', save:'Save settings', busy:'Working…', saved:'Settings saved', fail:'Operation failed. Check permissions, credential or settings revision and retry.', empty:'No catalog fetched. No selection uses the full account catalog.', help:'Select models to show in DSH. Choose the active model in the conversation composer.', boundary:'Configurable text/image input types. No custom API URL. DSH owns tool execution and approvals. SDK requests do not carry DSH attribution headers.', loading:'Settings loading or unavailable', endpoint:'Connection' } });
    function failure(result) {
      const text = String(result?.error?.message ?? '');
      const code = String(result?.error?.code ?? '');
      if (text.includes('no model discovery is registered')) return 'NO_DISCOVERY';
      if (text.includes('authentication or account permission')) return 'CURSOR_AUTH_FAILED';
      if (text.includes('rate limit')) return 'CURSOR_RATE_LIMITED';
      if (text.includes('temporarily unavailable')) return 'CURSOR_SERVICE_FAILED';
      if (text.includes('credential')) return 'MISSING_CREDENTIAL';
      if (text.includes('Cursor model discovery failed')) return 'CURSOR_CATALOG_FAILED';
      if (code.includes('forbidden') || code.includes('denied')) return 'ACCESS_DENIED';
      return 'REMOTE_REQUEST_FAILED';
    }
    const t = ctx.locale.bind(ns);
    function Panel({ scope, view, useRemoteAccess }) {
      const state = React.useSyncExternalStore(fn => scope.subscribe(fn), () => scope.getSnapshot());
      React.useSyncExternalStore(fn => ctx.locale.subscribe(fn), () => ctx.locale.getSnapshot());
      const [key,setKey] = React.useState(''), [selected,setSelected] = React.useState(null), [models,setModels] = React.useState([]), [busy,setBusy] = React.useState(false), [message,setMessage] = React.useState('');
      const canKey = useRemoteAccess('credentials/set'), canLoad = useRemoteAccess('llm/discoverModels');
      const profile = state.value?.providers?.cursor ?? {};
      const [picker,setPicker] = React.useState(false), [query,setQuery] = React.useState(''), [checked,setChecked] = React.useState([]);
      const dialogRef = React.useRef(null);
      React.useEffect(()=>{if(picker)dialogRef.current?.showModal();},[picker]);
      const chosen = (selected ?? profile.models ?? []).map(value => typeof value === 'string' ? {id:value} : value);
      const update = (index, patch) => setSelected(chosen.map((m,i)=>i===index?{...m,...patch}:m));
      const zh = ctx.locale.getLocale().active !== 'en';
      const text = (a,b) => zh ? a : b;
      const invalid = chosen.some(m=>!m.id.trim() || (m.contextWindow !== undefined && (!Number.isSafeInteger(m.contextWindow)||m.contextWindow<1))) || new Set(chosen.map(m=>m.id.trim())).size !== chosen.length;
      const ref = profile.apiKeyEnv || 'CURSOR_API_KEY';
      const disabled = busy || !state.writable || state.status !== 'ready';
      async function load() {
        setBusy(true); setMessage('');
        try { const result = await ctx.remote.llm.discoverModels(ns, { provider:'cursor', ...(key.trim() ? {apiKey:key.trim()} : {}) }); if (!result.ok) { setMessage(t('fail') + ' [' + failure(result) + ']'); return; } setModels(result.value); setChecked([]); setQuery(''); setPicker(true); }
        catch { setMessage(t('fail') + ' [CLIENT_TRANSPORT_FAILED]'); } finally { setBusy(false); }
      }
      async function save(event) {
        event.preventDefault(); if (invalid) return; setBusy(true); setMessage('');
        const revision = state.revision;
        try {
          if (key) { const result = await ctx.remote.credentials.set(ref,key); if (!result.ok) throw Error(); setKey(''); }
          const ok = await scope.mutate([{op:'set',path:['providers','cursor','apiKeyEnv'],value:ref},{op:'set',path:['providers','cursor','models'],value:chosen.map(m=>({id:m.id.trim(),...(m.name?{name:m.name}:{}),...(m.inputModalities?{inputModalities:m.inputModalities}:{}),...(m.contextWindow?{contextWindow:m.contextWindow}:{})}))}],revision);
          if (!ok) throw Error(); setSelected(null); setMessage(t('saved'));
        } catch { setMessage(t('fail')); } finally { setBusy(false); }
      }
      if (view === 'summary') return t('title');
      if (state.status !== 'ready') return h('p',{role:'status'},t('loading'));
      function Picker() {
        const visible = models.filter(m=>(m.id+' '+(m.name??'')).toLowerCase().includes(query.toLowerCase()));
        return h('dialog',{ref:dialogRef,className:'dcp-picker',onCancel:()=>setPicker(false),'aria-label':text('选择要添加的模型','Select models to add')},
          h('h3',null,text('选择要添加的模型','Select models to add')),
          h('p',null,text('勾选要添加的账号模型。','Select available account models.')),
          h('input',{autoFocus:true,placeholder:text('搜索模型','Search models'),value:query,onChange:e=>setQuery(e.target.value)}),
          h('button',{type:'button',onClick:()=>setChecked(visible.map(m=>m.id))},text('全选','Select all')),
          h('div',{className:'dcp-options'},visible.map(m=>h('label',{key:m.id},h('input',{type:'checkbox',checked:checked.includes(m.id),onChange:e=>setChecked(e.target.checked?[...checked,m.id]:checked.filter(id=>id!==m.id))}),m.name||m.id))),
          h('div',{className:'dcp-row'},h('button',{type:'button',onClick:()=>setPicker(false)},text('取消','Cancel')),h('button',{type:'button',onClick:()=>{setSelected([...chosen,...models.filter(m=>checked.includes(m.id)&&!chosen.some(c=>c.id===m.id)).map(m=>({id:m.id,name:m.name||m.id,inputModalities:['text']}))]);setPicker(false);}},text('添加所选','Add selected'))));
      }
      return h('form',{className:'dcp-config',onSubmit:save},
        h('style',null,'.dcp-config{max-width:720px;padding:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-primary);font-size:14px}.dcp-config label{display:block;margin:20px 0 8px}.dcp-config input:not([type=checkbox]){box-sizing:border-box;width:100%;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:inherit;font:inherit}.dcp-config button{font:inherit;padding:10px 16px;background:var(--dsw-alias-bg-layer-2);color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;cursor:pointer}.dcp-config button:disabled{opacity:.5;cursor:not-allowed}.dcp-config p{color:var(--dsw-alias-label-secondary);line-height:1.7}.dcp-config .dcp-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.dcp-config .dcp-models{max-height:320px;overflow:auto}.dcp-config .dcp-models label{margin:0;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2);overflow-wrap:anywhere}.dcp-config h3{font-size:16px;margin:0}.dcp-config input[type=checkbox]{margin-right:10px}'),
        h('style',null,'.dcp-config .dcp-model{border:1px solid var(--dsw-alias-border-l2);border-radius:16px;padding:12px;margin:16px 0}.dcp-config .dcp-models{max-height:none;overflow:visible}.dcp-model .dcp-row{flex-wrap:nowrap}.dcp-model .dcp-row input{flex:1;min-width:0}.dcp-model details{margin-top:12px}.dcp-empty{padding:24px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:16px}.dcp-picker{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:24px;padding:24px;width:min(560px,85vw)}.dcp-picker::backdrop{background:#0008}.dcp-options{max-height:40vh;overflow:auto;margin:16px 0}@media(max-width:560px){.dcp-model .dcp-row{flex-wrap:wrap}.dcp-model .dcp-row input{flex-basis:100%}}'),
        h('h3',null,t('title')),h('label',{htmlFor:'dcp-sdk'},t('endpoint')),h('input',{id:'dcp-sdk',readOnly:true,value:t('sdk')}),
        h('label',{htmlFor:'dcp-key'},t('key')),h('input',{id:'dcp-key',type:'password',autoComplete:'new-password',value:key,disabled:disabled||!canKey,onChange:e=>setKey(e.target.value)}),h('p',null,t('hint')),
        h('div',{className:'dcp-row'},h('h3',null,t('models')),h('button',{type:'button',disabled:disabled||!canLoad,onClick:load},t(busy?'busy':'load'))),
        h('div',{className:'dcp-models'},chosen.length ? chosen.map((m,i)=>h('div',{className:'dcp-model',key:i},
          h('div',{className:'dcp-row'},h('input',{list:'dcp-model-ids',placeholder:text('模型 ID','Model ID'),'aria-label':'Model ID',value:m.id,disabled,onChange:e=>update(i,{id:e.target.value})}),h('input',{placeholder:text('显示名称','Display name'),'aria-label':'Display name',value:m.name??'',disabled,onChange:e=>update(i,{name:e.target.value})}),h('button',{type:'button',disabled,onClick:()=>setSelected(chosen.filter((_m,j)=>j!==i))},text('删除','Delete'))),
          h('details',null,h('summary',null,text('高级设置','Advanced settings')),h('label',null,text('上下文窗口（DSH 预算）','Context window (DSH budget)'),h('input',{type:'number',min:1,step:1,placeholder:text('默认 / 未知','Default / unknown'),value:m.contextWindow??'',disabled,onChange:e=>update(i,{contextWindow:e.target.value===''?undefined:Number(e.target.value)})})),h('p',null,text('最大输出 token 数：SDK 不支持指定，使用服务端默认。','Maximum output tokens: not exposed by SDK; server default.')),h('fieldset',{'aria-label':text('输入类型','Input types')},h('legend',null,text('输入类型','Input types')),['text','image'].map(type=>{const selected=m.inputModalities??['text','image'];return h('label',{key:type},h('input',{type:'checkbox',checked:selected.includes(type),disabled:disabled||(selected.length===1&&selected.includes(type)),onChange:e=>update(i,{inputModalities:['text','image'].filter(value=>value===type?e.target.checked:selected.includes(value))})}),text(type==='text'?'文字':'图片',type==='text'?'Text':'Images'));})),h('p',null,text('未勾选图片时，由 DSH 使用文字占位；至少保留一种输入类型。','Without Images, DSH uses a text placeholder. Keep at least one input type.'))))) : h('p',{className:'dcp-empty'},text('模型选择器中将不显示任何模型。','No models will appear in the model selector.'))),
        h('datalist',{id:'dcp-model-ids'},models.map(m=>h('option',{key:m.id,value:m.id},m.name))),
        h('button',{type:'button',disabled,onClick:()=>setSelected([...chosen,{id:'',name:'',inputModalities:['text']}])},text('＋ 添加模型','+ Add model')),
        h('p',null,text('上下文留空沿用提供商配置，否则保持未知；此设置不会改变 Cursor 模型真实容量。','Blank context inherits provider settings, otherwise remains unknown; this does not change Cursor model capacity.')),
        invalid?h('p',{role:'alert'},text('模型 ID 不能为空或重复，上下文必须是正整数。','Model IDs must be nonempty and unique; context must be a positive integer.')):null,
        picker?Picker():null,
        h('button',{type:'submit',disabled:disabled||invalid||!!key&&!canKey},t(busy?'busy':'save')),h('p',{role:'status'},message),h('p',null,t('boundary')));
    }
    ctx.inject(['configForms'], c => {
      const forms = c.configForms;
      c.effect(() => forms.whileServed([ns], () => c.slots.inject('plugins.bundle.config', () => c.slots.register({name:'plugins.bundle.config',key:'@local/dsh-cursor-provider'}, props=>h(Panel,{...props,scope:forms.get(ns)})))), 'cursor configuration panel');
    });
  }};
}});
