import { randomUUID, createHash } from 'node:crypto';
import { ProviderError } from './provider.js';

/** In-memory handoff only. SDK callbacks never execute DSH tools. */
export class NativeBridge {
  constructor(tools, validate, notify) {
    if (new Set(tools.map(tool => tool.name)).size !== tools.length) throw new ProviderError('INVALID_TOOLS', 'Native tool names must be unique');
    this.tools = tools; this.notify = notify; this.pending = new Map(); this.closed = false;
    this.customTools = Object.fromEntries(tools.map(tool => [tool.name, {
      description: `${tool.name}: ${tool.description ?? ''}`,
      inputSchema: tool.parameters,
      execute: (args, context) => this.request(tool, args, context, validate),
    }]));
  }
  request(tool, args, context, validate) {
    if (this.closed) return Promise.reject(new ProviderError('ABORTED', 'Tool bridge closed'));
    if (!args || typeof args !== 'object' || Array.isArray(args) || validate?.(tool.parameters, args) !== true) {
      const error = new ProviderError('INVALID_ARGUMENTS', 'Native tool arguments do not match the active schema');
      this.notify({ type: 'failure', error });
      return Promise.reject(error);
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, name: tool.name, arguments: JSON.stringify(args), sdkId: context?.toolCallId });
      this.notify({ type: 'tool-call', id, name: tool.name, arguments: JSON.stringify(args) });
    });
  }
  results(messages, ids = [...this.pending.keys()]) {
    const owner = messages.findLastIndex(message => message.role === 'assistant' && message.content.some(block => block.type === 'tool-call' && this.pending.has(block.id)));
    const tail = messages.slice(owner + 1);
    if (owner < 0 || tail.some(message => message.role !== 'tool' && !isRuntimeContext(message))) throw new ProviderError('TOOL_RESULT_MISMATCH', 'Native continuation requires matching tool results and sourced runtime context');
    if (tail.some(message => message.role === 'tool' && !ids.includes(message.toolCallId))) throw new ProviderError('TOOL_RESULT_MISMATCH', 'Unexpected native tool result');
    const updates = messages.filter(isRuntimeContext).map(({ role, content }) => ({ role, content }));
    return ids.map((id, index) => {
      const pending = this.pending.get(id);
      if (!pending) throw new ProviderError('TOOL_RESULT_MISMATCH', 'Native callback is no longer pending');
      const matches = tail.filter(message => message.role === 'tool' && message.toolCallId === id);
      const result = matches.length === 1 ? matches[0] : undefined;
      const call = messages.flatMap(message => message.role === 'assistant' ? message.content : []).find(block => block.type === 'tool-call' && block.id === id);
      if (!result || !call || call.name !== pending.name || call.arguments !== pending.arguments) {
        throw new ProviderError('TOOL_RESULT_MISMATCH', 'Pending native tool calls require their exact DSH call and result');
      }
      return [id, pending, index === 0 && updates.length ? { ...result, content: [...result.content, { type: 'text', text: 'DSH runtime-context updates after this tool call (conversation data, not tool output):\n' + JSON.stringify(updates) }] } : result];
    });
  }
  resume(messages, ids) {
    const results = this.results(messages, ids);
    for (const [id, pending, result] of results) {
      this.pending.delete(id);
      pending.resolve({ content: result.content.map(block => block.type === 'image' && block.sdkData ? { type: 'image', data: block.sdkData.data, mimeType: block.sdkData.mimeType } : { type: 'text', text: block.type === 'text' ? block.text : JSON.stringify(block) }), isError: result.isError === true });
    }
  }
  close() {
    this.closed = true;
    for (const pending of this.pending.values()) pending.reject(new ProviderError('ABORTED', 'Tool bridge cancelled'));
    this.pending.clear();
  }
}

export const isRuntimeContext = message => message.role === 'user' && message.source?.kind === 'runtime-context' && message.source?.form === 'snapshot';
export const stableHistory = messages => messages.filter(message => !isRuntimeContext(message));

export const historyIdentity = messages => createHash('sha256').update(JSON.stringify(messages.map(({ role, content, toolCallId, isError }) => ({ role, content, toolCallId, isError })))).digest('hex');

export const bridgeIdentity = ({ apiKey, model, tools, sessionId, system, purpose, toolHistory }) => createHash('sha256').update(JSON.stringify({ apiKey, model, tools, sessionId, system, purpose, toolHistory })).digest('hex');
