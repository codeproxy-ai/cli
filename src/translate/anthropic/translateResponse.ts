import type { AnthropicResponse, AnthropicContentBlock } from '../../types/anthropic.js';
import type {
  ResponsesOutputItem,
  ResponsesOutputFunctionCall,
  ResponsesOutputMessage,
  ResponsesOutputReasoning,
  ResponsesResponse,
} from '../../types/responses.js';
import { jsonStringifySafe } from '../../utils/json.js';
import { makeId } from '../../utils/id.js';

export interface TranslateResponseOptions {
  responseId?: string;
  createdAt?: number;
  model?: string;
}

/** Convert a non-streaming Anthropic response into a Responses-API response. */
export function translateResponse(
  body: AnthropicResponse,
  options: TranslateResponseOptions = {},
): ResponsesResponse {
  const createdAt = options.createdAt ?? Math.floor(Date.now() / 1000);
  const id = options.responseId ?? body.id ?? makeId('resp');
  const model = options.model ?? body.model ?? '';

  const output = mapOutputItems(body.content ?? []);
  const usage = body.usage ?? { input_tokens: 0, output_tokens: 0 };

  return {
    id,
    object: 'response',
    created_at: createdAt,
    model,
    status: 'completed',
    output,
    usage: {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
      input_tokens_details: {
        cached_tokens: usage.cache_read_input_tokens ?? 0,
        cache_creation_tokens: usage.cache_creation_input_tokens ?? 0,
      },
    },
  };
}

const SHELL_TOOL_NAMES = new Set(['shell', 'container.exec', 'shell_command']);

export function mapOutputItems(content: AnthropicContentBlock[]): ResponsesOutputItem[] {
  const out: ResponsesOutputItem[] = [];
  const textChunks: string[] = [];

  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const btype: string = block.type;
    if (btype === 'text') {
      textChunks.push(String(block.text ?? ''));
    } else if (btype === 'tool_use') {
      const args = jsonStringifySafe(block.input ?? {});
      const callId = block.id ?? makeId('call');
      const item: ResponsesOutputFunctionCall = {
        id: callId,
        type: 'function_call',
        status: 'completed',
        name: block.name ?? 'tool',
        arguments: args,
        call_id: callId,
      };
      if (block.name && SHELL_TOOL_NAMES.has(block.name)) {
        item.type = 'local_shell_call';
        const input_: Record<string, unknown> = block.input ?? {};
        const command: string[] = input_.command ?? [];
        item.action = { type: 'exec', command: command };
      }
      out.push(item);
    } else if (btype === 'thinking') {
      const text = String(block.thinking ?? '');
      const reasoning: ResponsesOutputReasoning = {
        id: makeId('rs'),
        type: 'reasoning',
        summary: [],
        content: [{ type: 'reasoning_text', text }],
        status: 'completed',
      };
      out.push(reasoning);
    }
  }

  if (textChunks.length) {
    const message: ResponsesOutputMessage = {
      id: makeId('msg'),
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: textChunks.join('') }],
    };
    out.push(message);
  }

  return out;
}
