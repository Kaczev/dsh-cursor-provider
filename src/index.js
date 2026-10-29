import z from '@deepseek-ai/schemastery';
import Ajv from 'ajv';
import { LlmAdapter, offloadedImageText } from '@deepseek-ai/dsh-llm';
import { CursorTransport, ATTRIBUTION_NOTICE } from './transport.js';
import { defineAdapter, contextChoices } from './adapter.js';
import { ProviderError } from './provider.js';

export const name = 'cursor-provider';
export const inject = ['llm', 'credentials'];
export const Config = z.object({
  providers: z.dict(z.object({
    apiKeyEnv: z.string().role('credential-ref'),
    displayName: z.string(),
    models: z.array(z.union([z.string(), z.object({ id: z.string().required(), name: z.string(), inputModalities: z.array(z.union([z.const('text'), z.const('image')])).min(1).default(undefined), contextWindow: z.number().step(1).min(1), fast: z.boolean(), fastNameAuto: z.boolean() })])),
    contextWindow: z.number().step(1).min(1),
  })).default({}).volatile(),
});

export function apply(ctx, config) {
  const ns = ctx.fiber.entry?.options.id ?? name;
  ctx.inject(['settings'], child => child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)));
  const transport = new CursorTransport();
  ctx.effect(() => () => transport.close());
  ctx.logger.warn(ATTRIBUTION_NOTICE);
  const profile = () => config.providers.get().cursor ?? {};
  const credential = async () => {
    const ref = profile().apiKeyEnv;
    if (!ref) throw new ProviderError('MISSING_CREDENTIAL', 'Configure a Cursor API key on the plugin configuration page');
    const hit = await ctx.credentials.resolve(ref);
    if (!hit?.value) throw new ProviderError('MISSING_CREDENTIAL', 'The configured Cursor credential is unavailable');
    return hit.value;
  };
  const ajv = new Ajv({ strict: false, allErrors: false, validateFormats: false });
  const validators = new Map();
  const validate = (schema, args) => {
    const key = JSON.stringify(schema);
    let validator = validators.get(key);
    if (!validator) {
      validator = ajv.compile(schema);
      if (validators.size >= 256) validators.clear();
      validators.set(key, validator);
    }
    return validator(args) === true;
  };
  const Adapter = defineAdapter({ LlmAdapter, transport, profile, credential, validate, attachments: () => ctx.get('attachments'), offloadedImageText });
  const adapter = new Adapter();
  ctx.llm.registerAdapter(['cursor'], adapter);
  ctx.llm.registerModelDiscovery(ns, async (request, signal) => {
    if (request.provider && request.provider !== 'cursor') throw new ProviderError('INVALID_PROVIDER', 'Only Cursor is supported');
    if (request.baseURL) throw new ProviderError('UNSUPPORTED_ENDPOINT', 'Cursor uses its official SDK endpoint, not a custom base URL');
    const key = request.apiKey || await credential();
    const models = await transport.catalog(key, signal, { refresh: true });
    return models.flatMap(m => {
      const values = new Set([...(m.parameters?.find(p => p.id === 'fast')?.values ?? []).map(v => v.value), ...(m.variants ?? []).flatMap(v => v.params.filter(p => p.id === 'fast').map(p => p.value))]);
      // Parameter rows are private capability carriers; the picker shows base IDs only.
      return [{ id: m.id, name: m.displayName, ...(contextChoices(m).at(-1) ? {contextWindow:contextChoices(m).at(-1).tokens} : {}) },
        ...contextChoices(m).map(p => ({id:m.id+'@context='+p.value,contextWindow:p.tokens})),
        ...(['false','true'].every(value => values.has(value)) ? ['false','true'].map(value => ({ id: m.id + '@fast=' + value, name: m.displayName + (value === 'true' ? ' Fast' : '') })) : [])];
    });
  });
}
