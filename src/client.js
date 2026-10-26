window.__ModuleLoader__.load({ id: 'dsh-cursor-provider', factory(require) {
  const React = require('react'), h = React.createElement;
  return { inject: ['slots', 'locale', 'remote', 'remote.credentials', 'remote.llm'], apply(ctx) {
    const ns = 'cursor-provider';

    ctx.locale.register(ns, {
      zh: {
        title: 'Cursor 模型配置',
        heading: 'Cursor',
        key: 'API 密钥',
        keyPlaceholder: '输入 API 密钥',
        keyPlaceholderSaved: '留空使用已保存凭据',
        keyReveal: '显示密钥',
        keyHide: '隐藏密钥',
        authHelp: '认证说明',
        keyHelp: '密钥写入 DSH 凭据服务（{ref}），不写入插件配置或日志。这里留空表示继续使用已保存的凭据。',
        readOnly: '当前部署的设置文档为只读，配置无法保存。',
        customized: '自定义设置',
        displayName: '显示名称',
        displayNamePlaceholder: '留空时使用 Cursor',
        endpoint: '接入方式',
        sdk: 'Cursor 官方 SDK · @cursor/sdk',
        endpointHint: '通过官方 SDK 固定连接 Cursor，不支持自定义 API 地址或协议。',
        models: '模型目录',
        modelsInherited: '正在使用完整目录',
        modelsCustomized: '已自定义模型目录',
        resetModels: '恢复默认模型',
        fetchModels: '获取可用模型',
        fetching: '正在询问提供商…',
        fetchTitle: '选择模型',
        fetchDescription: '以下是账号可用的模型，勾选的模型组成模型目录。',
        fetchSearch: '搜索模型',
        fetchNoMatches: '没有匹配的模型。',
        fetchSelectAll: '全选',
        fetchDeselectAll: '取消全选',
        fetchAdopt: '更新列表',
        fetchEmpty: '该账号没有列出任何模型，请手动添加。',
        modelId: '模型 ID',
        modelName: '显示名称',
        modelNamePlaceholder: '留空时使用模型 ID',
        modelAdvanced: '模型选项',
        removeModel: '删除模型',
        contextWindow: '上下文窗口',
        contextWindowPlaceholder: '使用提供商默认值',
        maxTokens: '最大输出 token 数',
        maxTokensPlaceholder: '使用提供商默认值',
        maxTokensHint: 'SDK 不支持指定最大输出 token 数，使用服务端默认值。',
        modelInputTypes: '输入类型',
        modelInputText: '文本',
        modelInputImage: '图片',
        imageNote: '未勾选图片时，由 DSH 使用文字占位；至少保留一种输入类型。',
        modelsEmpty: '模型选择器中将不显示任何模型；添加模型后才会出现在这里。',
        fetchKeepOne: '请至少保留一个勾选的模型。',
        addModel: '添加模型',
        modelFailure: '模型 {index}：{message}',
        modelIdRequired: '模型 ID 不能为空。',
        modelIdDuplicate: '模型 ID 不能重复。',
        modelContextInvalid: '上下文窗口必须是正数，例如 131072、256K 或 1M。',
        save: '保存',
        saving: '保存中…',
        saved: '配置已保存。',
        cancel: '取消',
        close: '关闭',
        fail: '操作失败，请检查权限、密钥或配置版本后重试。',
        loading: '配置加载中或不可用',
      },
      en: {
        title: 'Cursor model settings',
        heading: 'Cursor',
        key: 'API key',
        keyPlaceholder: 'Enter your API key',
        keyPlaceholderSaved: 'Leave blank to use saved credentials',
        keyReveal: 'Show secret',
        keyHide: 'Hide secret',
        authHelp: 'Authentication details',
        keyHelp: 'The key is written to DSH credentials ({ref}), never to plugin settings or logs. Leaving it blank keeps the stored credential.',
        readOnly: 'The settings document is read-only in this deployment; changes cannot be saved.',
        customized: 'Customized settings',
        displayName: 'Display name',
        displayNamePlaceholder: 'Uses Cursor when empty',
        endpoint: 'Connection',
        sdk: 'Official Cursor SDK · @cursor/sdk',
        endpointHint: 'Cursor is reached through its official SDK; a custom API URL or protocol is not supported.',
        models: 'Models',
        modelsInherited: 'Using the full catalog',
        modelsCustomized: 'Customized model catalog',
        resetModels: 'Restore defaults',
        fetchModels: 'Fetch available models',
        fetching: 'Asking the provider…',
        fetchTitle: 'Choose models',
        fetchDescription: 'These are the models this account has available. Checked models make up the model catalog.',
        fetchSearch: 'Search models',
        fetchNoMatches: 'No matching models.',
        fetchSelectAll: 'Select all',
        fetchDeselectAll: 'Deselect all',
        fetchAdopt: 'Update list',
        fetchEmpty: 'This account listed no models. Add them by hand.',
        modelId: 'Model ID',
        modelName: 'Display name',
        modelNamePlaceholder: 'Uses the model ID when empty',
        modelAdvanced: 'Model options',
        removeModel: 'Delete model',
        contextWindow: 'Context window',
        contextWindowPlaceholder: 'Uses the provider default',
        maxTokens: 'Max output tokens',
        maxTokensPlaceholder: 'Uses the provider default',
        maxTokensHint: 'The SDK does not expose max output tokens; the server default applies.',
        modelInputTypes: 'Input types',
        modelInputText: 'Text',
        modelInputImage: 'Image',
        imageNote: 'Without Image, DSH uses a text placeholder. Keep at least one input type.',
        modelsEmpty: 'No models will be shown in the selector. Add models to list them here.',
        fetchKeepOne: 'Keep at least one model checked.',
        addModel: 'Add model',
        modelFailure: 'Model {index}: {message}',
        modelIdRequired: 'Model ID is required.',
        modelIdDuplicate: 'Model ID must be unique.',
        modelContextInvalid: 'Context window must be a positive count, like 131072, 256K, or 1M.',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Settings saved.',
        cancel: 'Cancel',
        close: 'Close',
        fail: 'Operation failed. Check permissions, credential or settings revision and retry.',
        loading: 'Settings loading or unavailable',
      },
    });

    const t = ctx.locale.bind(ns);
    const copy = (key, values) => String(t(key)).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);

    /** Accepted capacity spellings: a decimal count with an optional K/M suffix. */
    const CAPACITY_PATTERN = /^(\d+(?:\.\d+)?)([km])?$/i;
    const CAPACITY_SCALE = { k: 1_000, m: 1_000_000 };
    function parseCapacity(textValue) {
      const trimmed = String(textValue).trim();
      if (trimmed.length === 0) return undefined;
      const match = CAPACITY_PATTERN.exec(trimmed);
      if (match === null) return Number.NaN;
      const suffix = match[2] === undefined ? undefined : match[2].toLowerCase();
      const scale = suffix === 'k' || suffix === 'm' ? CAPACITY_SCALE[suffix] : 1;
      const scaled = Number(match[1]) * scale;
      const rounded = Math.round(scaled);
      return Math.abs(scaled - rounded) < 1e-6 ? rounded : scaled;
    }
    function formatCapacity(value) {
      if (!Number.isInteger(value) || value <= 0) return String(value);
      if (value % CAPACITY_SCALE.m === 0) return String(value / CAPACITY_SCALE.m) + 'M';
      if (value % CAPACITY_SCALE.k === 0) return String(value / CAPACITY_SCALE.k) + 'K';
      return String(value);
    }

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

    /** Line icons matching the settings section's 16px stroke set. */
    function glyph(size, children, box) {
      return h('svg', {
        width: size, height: size, viewBox: box ?? '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      }, children);
    }
    const GLYPH = {
      chevronDown: () => glyph(12, h('path', { d: 'M4 6.5L8 10.5L12 6.5' })),
      chevronRight: () => glyph(12, h('path', { d: 'M6.5 4L10.5 8L6.5 12' })),
      trash: () => glyph(14, h('path', { d: 'M3.5 4.5h9M6.5 4.5v-1h3v1M4.5 4.5v8h7v-8M6.8 6.9v3.4M9.2 6.9v3.4' })),
      plus: () => glyph(12, h('path', { d: 'M8 3.5v9M3.5 8h9' })),
      close: () => glyph(12, h('path', { d: 'M4 4l8 8M12 4l-8 8' })),
      eye: (shown) => h('svg', {
        width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.3, strokeLinecap: 'round', 'aria-hidden': 'true',
      }, h('path', {
        d: shown
          ? 'M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8ZM10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z'
          : 'M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8ZM2.5 2.5L13.5 13.5',
      })),
    };

    /** Draft rows carry capacity as typed text; the stored value stays a token count. */
    function draftRows(models) {
      return (Array.isArray(models) ? models : []).map(value => {
        const item = typeof value === 'string' ? { id: value } : (value ?? {});
        return {
          id: typeof item.id === 'string' ? item.id : '',
          name: typeof item.name === 'string' ? item.name : '',
          inputModalities: Array.isArray(item.inputModalities) && item.inputModalities.length > 0
            ? item.inputModalities.filter(type => type === 'text' || type === 'image')
            : undefined,
          capacity: typeof item.contextWindow === 'number' ? formatCapacity(item.contextWindow) : '',
        };
      });
    }
    const modalities = row => Array.isArray(row.inputModalities) && row.inputModalities.length > 0 ? row.inputModalities : ['text', 'image'];

    function capacityFailure(row, index) {
      if (row.capacity.trim().length === 0) return undefined;
      const parsed = parseCapacity(row.capacity);
      return parsed === undefined || Number.isNaN(parsed) || parsed < 1 ? ['modelContextInvalid', index] : undefined;
    }
    function modelFailure(rows) {
      const seen = new Set();
      for (let index = 0; index < rows.length; index++) {
        const id = rows[index].id.trim();
        if (id.length === 0) return ['modelIdRequired', index];
        if (seen.has(id)) return ['modelIdDuplicate', index];
        seen.add(id);
        const capacity = capacityFailure(rows[index], index);
        if (capacity !== undefined) return capacity;
      }
      return undefined;
    }

    const CSS = [
      /* Editing surface: a filled module on the panel, matching the settings card material. */
      '.dcp-editor{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:14px 16px;border:0.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}',
      '.dcp-editorHeader{display:flex;align-items:baseline;gap:8px}',
      '.dcp-editorTitle{font-size:14px;line-height:22px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dcp-editorRoute{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dcp-field{display:flex;flex-direction:column;gap:6px}',
      '.dcp-fieldLabel{display:inline-flex;align-items:center;gap:10px;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.dcp-helpWrap{position:relative;display:inline-flex}',
      '.dcp-helpButton{width:16px;height:16px;padding:0;border:0.5px solid var(--dsw-alias-border-l3);border-radius:50%;corner-shape:round;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11px;line-height:15px;text-align:center;cursor:help}',
      '.dcp-helpBubble{position:absolute;left:0;top:calc(100% + 6px);z-index:20;display:none;width:max-content;max-width:280px;padding:8px 10px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:400;white-space:normal}',
      '.dcp-helpWrap:hover .dcp-helpBubble,.dcp-helpButton:focus-visible+.dcp-helpBubble{display:block}',
      '.dcp-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);font:inherit;font-size:14px;line-height:22px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}',
      '.dcp-input::placeholder{color:var(--dsw-alias-label-dimmed)}',
      '.dcp-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}',
      '.dcp-input:disabled{opacity:0.6;cursor:default}',
      '.dcp-input:read-only{color:var(--dsw-alias-label-secondary);cursor:default}',
      '.dcp-keyInput{position:relative}',
      '.dcp-keyInputFilled{padding-right:40px}',
      '.dcp-keyToggle{position:absolute;inset:1px 1px 1px auto;display:inline-flex;align-items:center;justify-content:center;width:32px;padding:0;border:none;border-radius:var(--dsw-radius-md);background:none;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dcp-advancedHint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dcp-customized{border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:10px}',
      '.dcp-customizedSummary{display:flex;align-items:center;gap:6px;width:fit-content;padding:2px 4px;margin-left:-4px;border-radius:var(--dsw-radius-sm);cursor:pointer;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);list-style:none}',
      '.dcp-customizedSummary::-webkit-details-marker{display:none}',
      '.dcp-customizedSummary::before{content:"";width:5px;height:5px;border-right:1.5px solid currentcolor;border-bottom:1.5px solid currentcolor;transform:rotate(-45deg) translate(-1px,-1px);transition:transform 120ms ease}',
      '.dcp-customized[open]>.dcp-customizedSummary::before{transform:rotate(45deg) translate(-1px,-1px)}',
      '.dcp-customizedBody{display:flex;flex-direction:column;gap:12px;padding-top:12px}',
      '.dcp-modelCatalog{position:relative;display:flex;flex-direction:column;gap:10px;padding-top:12px;border-top:0.5px solid var(--dsw-alias-border-l2)}',
      '.dcp-modelCatalogHeading{display:flex;flex-direction:column;gap:2px}',
      '.dcp-modelCatalogTitle{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}',
      '.dcp-modelCatalogMeta{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dcp-modelList{display:flex;flex-direction:column;gap:8px}',
      '.dcp-modelListHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
      '.dcp-modelHeadActions{display:flex;align-items:center;gap:4px}',
      '.dcp-modelEntry{position:relative;border:0.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-lg);padding:6px}',
      '.dcp-modelRow{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto auto;align-items:center;gap:6px}',
      '.dcp-iconButton{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}',
      '.dcp-iconButton:disabled{opacity:0.4;cursor:default}',
      '.dcp-modelAdvanced{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px 4px 2px}',
      '.dcp-modelField{display:flex;flex-direction:column;min-width:0;gap:4px}',
      '.dcp-modelFieldLabel{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dcp-modelInputTypes{grid-column:1/-1;min-width:0;margin:0;padding:0;border:none}',
      '.dcp-modelInputTypes legend{padding:0;margin-bottom:4px}',
      '.dcp-modelInputChoices{display:flex;flex-wrap:wrap;align-items:center;gap:16px;min-height:32px}',
      '.dcp-modelInputNote{grid-column:1/-1;margin:0}',
      '.dcp-modelEmpty{margin:0;padding:12px;border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-align:center}',
      '.dcp-addModelButton{box-sizing:border-box;align-self:flex-start;display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.dcp-editorActions{display:flex;justify-content:flex-end;gap:8px}',
      '.dcp-primaryButton,.dcp-secondaryButton{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 14px;border:none;border-radius:var(--dsw-radius-md);font:inherit;font-size:14px;line-height:22px;cursor:pointer}',
      '.dcp-primaryButton{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.dcp-secondaryButton{border:0.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary)}',
      '.dcp-linkButton{box-sizing:border-box;display:inline-flex;align-items:center;height:28px;padding:0 10px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.dcp-primaryButton:disabled,.dcp-secondaryButton:disabled,.dcp-linkButton:disabled,.dcp-iconButton:disabled,.dcp-addModelButton:disabled,.dcp-keyToggle:disabled,.dcp-helpButton:disabled{opacity:0.4;cursor:default}',
      '.dcp-primaryButton:focus-visible,.dcp-secondaryButton:focus-visible,.dcp-linkButton:focus-visible,.dcp-iconButton:focus-visible,.dcp-addModelButton:focus-visible,.dcp-customizedSummary:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.dcp-keyToggle:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '.dcp-checkbox{display:inline-flex;align-items:center;gap:6px;font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dcp-checkbox input{flex:0 0 auto;width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:inherit}',
      '.dcp-checkbox:has(input:disabled){cursor:default;opacity:0.5}',
      '.dcp-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
      '.dcp-savedNotice{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}',
      '.dcp-notice{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-label)}',
      '@media (hover:hover){',
      '.dcp-helpButton:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-tertiary)}',
      '.dcp-customizedSummary:hover{color:var(--dsw-alias-label-primary)}',
      '.dcp-keyToggle:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
      '.dcp-iconButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dcp-iconButtonDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',
      '.dcp-linkButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      '.dcp-addModelButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dcp-primaryButton:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.dcp-secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}',
      '}',
      '@media (prefers-reduced-motion:reduce){.dcp-customizedSummary::before{transition:none}}',
      /* Modal: the primitives' mask + secondary-layer card, without the portal layer. */
      '.dcp-modalRoot{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(24px,var(--dsh-frame-overlay-top,24px)) 24px}',
      '.dcp-modalMask{position:absolute;inset:var(--dsh-frame-chrome-top,0px) 0 0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}',
      '.dcp-dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:20px;width:min(520px,100%);max-height:100%;padding:0 0 24px;overflow:hidden;border:0;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary)}',
      '.dcp-dialogHeader{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}',
      '.dcp-dialogTitle{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dcp-dialogClose{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dcp-dialogDescription{margin:0;padding:0 24px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dcp-dialogBody{display:flex;flex-direction:column;min-width:0;padding:0 24px;overflow:auto}',
      '.dcp-candidateToolbar{display:flex;align-items:center;gap:8px;margin-bottom:6px}',
      '.dcp-candidateSearch{min-width:0;flex:1 1 240px}',
      '.dcp-candidateList{display:flex;flex-direction:column;gap:2px;max-height:320px;margin:0;overflow-y:auto;padding:0;list-style:none}',
      '.dcp-candidate{border-radius:var(--dsw-radius-md);list-style:none}',
      '.dcp-candidateLabel{display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:var(--dsw-radius-md)}',
      '.dcp-candidateId{flex:1 1 auto;min-width:0;font-family:var(--ds-font-family-code);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dcp-candidateEmpty{margin:24px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-align:center}',
      '.dcp-dialogFooter{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 24px}',
      '@media (hover:hover){.dcp-dialogClose:hover{background:var(--dsw-alias-interactive-bg-hover)}.dcp-candidateLabel:hover{background:var(--dsw-alias-interactive-bg-hover)}}',
    ].join('\n');

    function Panel({ scope, view, useRemoteAccess }) {
      const state = React.useSyncExternalStore(subscribe => scope.subscribe(subscribe), () => scope.getSnapshot());
      React.useSyncExternalStore(subscribe => ctx.locale.subscribe(subscribe), () => ctx.locale.getSnapshot());
      const [key, setKey] = React.useState('');
      const [revealed, setRevealed] = React.useState(false);
      const [draft, setDraft] = React.useState(null);
      const [expanded, setExpanded] = React.useState([]);
      const [customized, setCustomized] = React.useState(true);
      const [picker, setPicker] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [notice, setNotice] = React.useState(null);
      const canKey = useRemoteAccess('credentials/set');
      const canLoad = useRemoteAccess('llm/discoverModels');
      const profile = state.value?.providers?.cursor ?? {};
      const saved = {
        displayName: profile.displayName ?? '',
        models: draftRows(profile.models),
        inheritModels: profile.models === undefined,
      };
      const current = draft ?? saved;
      const rows = current.models;
      const ref = profile.apiKeyEnv || 'CURSOR_API_KEY';
      const disabled = busy || !state.writable || state.status !== 'ready';
      const failureInfo = modelFailure(rows);

      const commit = patch => setDraft({ ...current, ...patch });
      const update = (index, patch) => commit({ models: rows.map((row, at) => at === index ? { ...row, ...patch } : row) });
      const resetDraft = () => { setDraft(null); setKey(''); setRevealed(false); setNotice(null); };

      if (view === 'summary') return t('title');
      if (state.status !== 'ready') return h('p', { role: 'status' }, t('loading'));

      async function load() {
        setBusy(true); setNotice(null);
        try {
          const result = await ctx.remote.llm.discoverModels(ns, {
            provider: 'cursor',
            ...(key.trim() ? { apiKey: key.trim() } : {}),
          });
          if (!result.ok) {
            setNotice({ tone: 'error', text: t('fail') + ' [' + failure(result) + ']' });
            return;
          }
          if (result.value.length === 0) {
            setNotice({ tone: 'hint', text: t('fetchEmpty') });
            return;
          }
          const configured = new Set(rows.map(row => row.id.trim()).filter(id => id.length > 0));
          const stored = result.value.filter(model => configured.has(model.id)).map(model => model.id);
          setPicker({ models: result.value, query: '', checked: stored.length > 0 ? stored : result.value.map(model => model.id) });
        } catch {
          setNotice({ tone: 'error', text: t('fail') + ' [CLIENT_TRANSPORT_FAILED]' });
        } finally {
          setBusy(false);
        }
      }

      async function save(event) {
        event.preventDefault();
        if (failureInfo !== undefined) return;
        setBusy(true); setNotice(null);
        const revision = state.revision;
        try {
          if (key.length > 0) {
            const result = await ctx.remote.credentials.set(ref, key);
            if (!result.ok) throw Error();
            setKey(''); setRevealed(false);
          }
          const models = rows.map(row => {
            const capacity = parseCapacity(row.capacity);
            return {
              id: row.id.trim(),
              ...(row.name.trim().length > 0 ? { name: row.name.trim() } : {}),
              ...(Array.isArray(row.inputModalities) ? { inputModalities: [...row.inputModalities] } : {}),
              ...(capacity !== undefined ? { contextWindow: capacity } : {}),
            };
          });
          const displayName = current.displayName.trim();
          const ops = [
            { op: 'set', path: ['providers', 'cursor', 'apiKeyEnv'], value: ref },
            ...(displayName !== String(profile.displayName ?? '') ? [{ op: 'set', path: ['providers', 'cursor', 'displayName'], value: displayName }] : []),
            ...(current.inheritModels
              ? [{ op: 'unset', path: ['providers', 'cursor', 'models'] }]
              : [{ op: 'set', path: ['providers', 'cursor', 'models'], value: models }]),
          ];
          const ok = await scope.mutate(ops, revision);
          if (!ok) throw Error();
          setDraft(null);
          setNotice({ tone: 'saved', text: t('saved') });
        } catch {
          setNotice({ tone: 'error', text: t('fail') });
        } finally {
          setBusy(false);
        }
      }

      function adopt() {
        if (picker.checked.length === 0) return;
        const keep = rows.filter(row => picker.checked.includes(row.id.trim()));
        const added = picker.models
          .filter(model => picker.checked.includes(model.id) && !keep.some(row => row.id.trim() === model.id))
          .map(model => ({ id: model.id, name: model.name ?? '', capacity: '' }));
        setDraft({ ...current, models: [...keep, ...added], inheritModels: false });
        setExpanded([]);
        setPicker(null);
      }

      function rowView(row, index) {
        const open = expanded.includes(index);
        const position = String(index + 1);
        const selected = modalities(row);
        const lockedType = selected.length === 1 ? selected[0] : undefined;
        const capacity = capacityFailure(row, index);
        return h('div', { className: 'dcp-modelEntry', key: index },
          h('div', { className: 'dcp-modelRow' },
            h('input', {
              className: 'dcp-input', type: 'text', value: row.id, placeholder: t('modelId'),
              'aria-label': t('modelId') + ' ' + position, disabled, onChange: event => update(index, { id: event.target.value }),
            }),
            h('input', {
              className: 'dcp-input', type: 'text', value: row.name, placeholder: t('modelNamePlaceholder'),
              'aria-label': t('modelName') + ' ' + position, disabled, onChange: event => update(index, { name: event.target.value }),
            }),
            h('button', {
              type: 'button', className: 'dcp-iconButton', 'aria-label': t('modelAdvanced') + ' ' + position,
              'aria-expanded': open, title: t('modelAdvanced'), onClick: () => setExpanded(open ? expanded.filter(at => at !== index) : [...expanded, index]),
            }, open ? GLYPH.chevronDown() : GLYPH.chevronRight()),
            h('button', {
              type: 'button', className: 'dcp-iconButton dcp-iconButtonDanger', 'aria-label': t('removeModel') + ' ' + position,
              title: t('removeModel'), disabled, onClick: () => { commit({ models: rows.filter((_row, at) => at !== index) }); setExpanded([]); },
            }, GLYPH.trash()),
          ),
          open ? h('div', { className: 'dcp-modelAdvanced' },
            h('label', { className: 'dcp-modelField' },
              h('span', { className: 'dcp-modelFieldLabel' }, t('contextWindow')),
              h('input', {
                className: 'dcp-input', type: 'text', inputMode: 'numeric', value: row.capacity,
                placeholder: t('contextWindowPlaceholder'), 'aria-label': t('contextWindow') + ' ' + position,
                'aria-invalid': capacity !== undefined, disabled, onChange: event => update(index, { capacity: event.target.value }),
              }),
            ),
            h('label', { className: 'dcp-modelField' },
              h('span', { className: 'dcp-modelFieldLabel' }, t('maxTokens')),
              h('input', {
                className: 'dcp-input', type: 'text', value: '', placeholder: t('maxTokensPlaceholder'),
                'aria-label': t('maxTokens') + ' ' + position, title: t('maxTokensHint'), readOnly: true, disabled: true,
              }),
            ),
            h('fieldset', { className: 'dcp-modelInputTypes', 'aria-label': t('modelInputTypes') + ' ' + position },
              h('legend', { className: 'dcp-modelFieldLabel' }, t('modelInputTypes')),
              h('div', { className: 'dcp-modelInputChoices' },
                ['text', 'image'].map(type => h('label', { className: 'dcp-checkbox', key: type },
                  h('input', {
                    type: 'checkbox', checked: selected.includes(type), disabled: disabled || lockedType === type,
                    onChange: event => update(index, {
                      inputModalities: ['text', 'image'].filter(value => value === type ? event.target.checked : selected.includes(value)),
                    }),
                  }),
                  h('span', null, t(type === 'text' ? 'modelInputText' : 'modelInputImage')),
                )),
              ),
            ),
            selected.includes('image') ? null : h('p', { className: 'dcp-advancedHint dcp-modelInputNote' }, t('imageNote')),
          ) : null,
        );
      }

      function pickerBody() {
        const visible = picker.models.filter(model => (model.id + ' ' + (model.name ?? '')).toLowerCase().includes(picker.query.toLowerCase()));
        const allChecked = visible.length > 0 && visible.every(model => picker.checked.includes(model.id));
        return h('div', { className: 'dcp-modalRoot', onKeyDown: event => { if (event.key === 'Escape') setPicker(null); } },
          h('div', { className: 'dcp-modalMask', onClick: () => setPicker(null) }),
          h('div', { className: 'dcp-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('fetchTitle') },
            h('div', { className: 'dcp-dialogHeader' },
              h('h2', { className: 'dcp-dialogTitle' }, t('fetchTitle')),
              h('button', { type: 'button', className: 'dcp-dialogClose', 'aria-label': t('close'), onClick: () => setPicker(null) }, GLYPH.close()),
            ),
            h('p', { className: 'dcp-dialogDescription' }, t('fetchDescription')),
            h('div', { className: 'dcp-dialogBody' },
              h('div', { className: 'dcp-candidateToolbar' },
                h('input', {
                  className: 'dcp-input dcp-candidateSearch', autoFocus: true, placeholder: t('fetchSearch'),
                  'aria-label': t('fetchSearch'), value: picker.query, onChange: event => setPicker({ ...picker, query: event.target.value }),
                }),
                h('button', {
                  type: 'button', className: 'dcp-linkButton',
                  onClick: () => {
                    const next = allChecked
                      ? picker.checked.filter(id => !visible.some(model => model.id === id))
                      : [...new Set([...picker.checked, ...visible.map(model => model.id)])];
                    setPicker({ ...picker, checked: next });
                  },
                }, allChecked ? t('fetchDeselectAll') : t('fetchSelectAll')),
              ),
              h('ul', { className: 'dcp-candidateList' },
                visible.length === 0
                  ? h('li', { className: 'dcp-candidateEmpty' }, t('fetchNoMatches'))
                  : visible.map(model => h('li', { className: 'dcp-candidate', key: model.id },
                    h('label', { className: 'dcp-candidateLabel' },
                      h('input', {
                        type: 'checkbox', checked: picker.checked.includes(model.id),
                        onChange: event => setPicker({
                          ...picker,
                          checked: event.target.checked ? [...picker.checked, model.id] : picker.checked.filter(id => id !== model.id),
                        }),
                      }),
                      h('span', { className: 'dcp-candidateId' }, model.id),
                      model.name === undefined || model.name === model.id ? null : h('span', { className: 'dcp-modelCatalogMeta' }, model.name),
                    ),
                  )),
              ),
            ),
            h('div', { className: 'dcp-dialogFooter' },
              h('button', { type: 'button', className: 'dcp-secondaryButton', onClick: () => setPicker(null) }, t('cancel')),
              h('button', {
                type: 'button', className: 'dcp-primaryButton', onClick: adopt,
                disabled: picker.checked.length === 0, title: picker.checked.length === 0 ? t('fetchKeepOne') : undefined,
              }, t('fetchAdopt')),
            ),
          ),
        );
      }

      const saveBlocked = disabled || failureInfo !== undefined || (key.length > 0 && !canKey);

      return h('form', { className: 'dcp-config', onSubmit: save },
        h('style', null, CSS),
        h('div', { className: 'dcp-editor' },
          h('div', { className: 'dcp-editorHeader' },
            h('span', { className: 'dcp-editorTitle' }, current.displayName.trim() || t('heading')),
            h('span', { className: 'dcp-editorRoute' }, 'cursor'),
          ),
          h('div', { className: 'dcp-field' },
            h('span', { className: 'dcp-fieldLabel' },
              t('key'),
              h('span', { className: 'dcp-helpWrap' },
                h('button', { type: 'button', className: 'dcp-helpButton', 'aria-label': t('authHelp') }, '?'),
                h('span', { className: 'dcp-helpBubble', role: 'tooltip' }, copy('keyHelp', { ref })),
              ),
            ),
            h('div', { className: 'dcp-keyInput' },
              h('input', {
                id: 'dcp-key', className: 'dcp-input' + (key.length > 0 ? ' dcp-keyInputFilled' : ''),
                type: revealed ? 'text' : 'password', autoComplete: 'new-password',
                value: key, placeholder: t(key.length > 0 ? 'keyPlaceholder' : 'keyPlaceholderSaved'),
                'aria-label': t('key'), disabled: disabled || !canKey,
                onChange: event => { setRevealed(false); setKey(event.target.value); },
              }),
              key.length === 0 ? null : h('button', {
                type: 'button', className: 'dcp-keyToggle', 'aria-label': t(revealed ? 'keyHide' : 'keyReveal'),
                'aria-pressed': revealed, disabled: disabled,
                onClick: () => setRevealed(!revealed),
              }, GLYPH.eye(revealed)),
            ),
          ),
          h('details', {
            className: 'dcp-customized', open: customized,
            onToggle: event => setCustomized(event.currentTarget.open),
          },
            h('summary', { className: 'dcp-customizedSummary' }, t('customized')),
            h('div', { className: 'dcp-customizedBody' },
              h('div', { className: 'dcp-field' },
                h('span', { className: 'dcp-fieldLabel' }, t('displayName')),
                h('input', {
                  className: 'dcp-input', type: 'text', value: current.displayName,
                  placeholder: t('displayNamePlaceholder'), 'aria-label': t('displayName'),
                  disabled, onChange: event => commit({ displayName: event.target.value }),
                }),
              ),
              h('div', { className: 'dcp-field' },
                h('span', { className: 'dcp-fieldLabel' }, t('endpoint')),
                h('input', {
                  className: 'dcp-input', type: 'text', value: t('sdk'), 'aria-label': t('endpoint'),
                  readOnly: true, disabled: true,
                }),
                h('span', { className: 'dcp-advancedHint' }, t('endpointHint')),
              ),
              h('section', { className: 'dcp-modelCatalog' },
                h('div', { className: 'dcp-modelListHead' },
                  h('div', { className: 'dcp-modelCatalogHeading' },
                    h('span', { className: 'dcp-modelCatalogTitle' }, t('models')),
                    h('span', { className: 'dcp-modelCatalogMeta' }, t(current.inheritModels ? 'modelsInherited' : 'modelsCustomized')),
                  ),
                  h('div', { className: 'dcp-modelHeadActions' },
                    current.inheritModels ? null : h('button', {
                      type: 'button', className: 'dcp-linkButton', disabled,
                      onClick: () => { setDraft({ ...current, models: [], inheritModels: true }); setExpanded([]); },
                    }, t('resetModels')),
                    h('button', {
                      type: 'button', className: 'dcp-linkButton', disabled: disabled || !canLoad,
                      onClick: load,
                    }, t(busy ? 'fetching' : 'fetchModels')),
                  ),
                ),
                rows.length === 0
                  ? h('p', { className: 'dcp-modelEmpty' }, t('modelsEmpty'))
                  : h('div', { className: 'dcp-modelList' }, rows.map(rowView)),
                h('button', {
                  type: 'button', className: 'dcp-addModelButton', disabled,
                  onClick: () => {
                    setDraft({ ...current, models: [...rows, { id: '', name: '', capacity: '' }], inheritModels: false });
                    setExpanded([...expanded, rows.length]);
                  },
                }, GLYPH.plus(), t('addModel')),
              ),
            ),
          ),
          !state.writable ? h('p', { className: 'dcp-advancedHint' }, t('readOnly')) : null,
          failureInfo === undefined ? null : h('p', { className: 'dcp-advancedHint', role: 'alert' },
            copy('modelFailure', { index: String(failureInfo[1] + 1), message: t(failureInfo[0]) })),
          notice === null ? null : h('p', {
            className: notice.tone === 'error' ? 'dcp-error' : notice.tone === 'saved' ? 'dcp-savedNotice' : 'dcp-notice',
            role: notice.tone === 'error' ? 'alert' : 'status',
          }, notice.text),
          h('div', { className: 'dcp-editorActions' },
            h('button', { type: 'button', className: 'dcp-secondaryButton', disabled: busy, onClick: resetDraft }, t('cancel')),
            h('button', { type: 'submit', className: 'dcp-primaryButton', disabled: saveBlocked }, t(busy ? 'saving' : 'save')),
          ),
        ),
        picker === null ? null : pickerBody(),
      );
    }

    ctx.inject(['configForms'], c => {
      const forms = c.configForms;
      c.effect(() => forms.whileServed([ns], () => c.slots.inject('plugins.bundle.config', () => c.slots.register({ name: 'plugins.bundle.config', key: 'dsh-cursor-provider' }, props => h(Panel, { ...props, scope: forms.get(ns) })))), 'cursor configuration panel');
    });
  }};
}});
