// ==============================================================================
// Stream Translator
// ==============================================================================

import type { AnthropicStreamEvent, AnthropicContentBlock } from '../../types/anthropic.js';
import type {
  ResponsesOutputItem,
  ResponsesOutputFunctionCall,
  ResponsesOutputMessage,
  ResponsesOutputReasoning,
  ResponsesResponse,
  ResponsesStreamEvent,
} from '../../types/responses.js';
import { parseSseStream, type SseMessage } from '../../utils/sse.js';
import { safeJsonParse } from '../../utils/json.js';
import { makeId } from '../../utils/id.js';

export interface TranslateStreamOptions {
  model?: string;
  responseId?: string;
  // ==============================================================================
  // Event Handlers
  // ==============================================================================

  createdAt?: number;
  requestMetadata?: ResponsesStreamMetadata;
}

export interface ResponsesStreamMetadata {
  temperature?: number;
  top_p?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  store?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Consume an Anthropic SSE stream and yield Responses-API SSE events.
 */
export async function* translateStream(
  stream: ReadableStream<Uint8Array>,
  options: TranslateStreamOptions = {},
): AsyncGenerator<ResponsesStreamEvent, void, void> {
  const translator = new StreamTranslator(options);
  yield translator.createInitialEvent();
  for await (const msg of parseSseStream(stream)) {
    const event = parseAnthropicEvent(msg);
    if (!event) {
      continue;
    }
    yield* translator.handleEvent(event);
  }
  yield* translator.finalize();
}

/**
 * Consume an async iterable of parsed Anthropic events and yield Responses events.
 */
export async function* translateAnthropicEvents(
  events: AsyncIterable<AnthropicStreamEvent> | Iterable<AnthropicStreamEvent>,
  options: TranslateStreamOptions = {},
): AsyncGenerator<ResponsesStreamEvent, void, void> {
  const translator = new StreamTranslator(options);
  yield translator.createInitialEvent();
  for await (const event of events) {
    yield* translator.handleEvent(event);
  }
  yield* translator.finalize();
}

function parseAnthropicEvent(msg: SseMessage): AnthropicStreamEvent | undefined {
  const parsed = safeJsonParse<AnthropicStreamEvent>(msg.data);
  if (!parsed) {
    return undefined;
  }
  return parsed;
}

interface BlockState {
  type: 'text' | 'tool_use' | 'thinking' | string;
  outputIndex: number;
  item?: ResponsesOutputItem;
  buffer: string;
}

const SHELL_TOOL_NAMES = new Set(['shell', 'container.exec', 'shell_command']);

class StreamTranslator {
  private readonly model: string;
  private readonly responseId: string;
  private readonly createdAt: number;
  private readonly metadata: ResponsesStreamMetadata;
  private seq = 0;
  private outputCounter = 0;
  private readonly blocks = new Map<number, BlockState>();

  private inputTokens = 0;
  private outputTokens = 0;
  private cacheCreationTokens = 0;
  private cacheReadTokens = 0;

  private textItem?: ResponsesOutputMessage;
  private textItemIndex = -1;
  private textBuffer = '';

  private stopReason: string | undefined;

  constructor(options: TranslateStreamOptions) {
    this.model = options.model ?? '';
    this.responseId = options.responseId ?? makeId('resp');
    this.createdAt = options.createdAt ?? Math.floor(Date.now() / 1000);
    this.metadata = options.requestMetadata ?? {};
  }

  createInitialEvent(): ResponsesStreamEvent {
    const response: Partial<ResponsesResponse> = {
      id: this.responseId,
      object: 'response',
      created_at: this.createdAt,
      model: this.model,
      status: 'in_progress',
      temperature: this.metadata.temperature,
      top_p: this.metadata.top_p,
      tool_choice: this.metadata.tool_choice,
      tools: this.metadata.tools ?? [],
      parallel_tool_calls: true,
      store: this.metadata.store ?? true,
      metadata: this.metadata.metadata ?? {},
      output: [],
    };
    return this.makeEvent('response.created', { response });
  }

  *handleEvent(event: AnthropicStreamEvent): Generator<ResponsesStreamEvent, void, void> {
    switch (event.type) {
      case 'message_start': {
        // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
        const msgStartEvt = event as Extract<AnthropicStreamEvent, { type: 'message_start' }>;
        this.onMessageStart(msgStartEvt);
        return;
      }
      case 'content_block_start':
        {
          // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
          const cbsEvt = event as Extract<AnthropicStreamEvent, { type: 'content_block_start' }>;
          yield* this.onContentBlockStart(cbsEvt);
        }
        return;
      case 'content_block_delta':
        {
          // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
          const cbdEvt = event as Extract<AnthropicStreamEvent, { type: 'content_block_delta' }>;
          yield* this.onContentBlockDelta(cbdEvt);
        }
        return;
      case 'content_block_stop':
        return;
      case 'message_delta':
        {
          // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
          const msgDeltaEvt = event as Extract<AnthropicStreamEvent, { type: 'message_delta' }>;
          this.onMessageDelta(msgDeltaEvt);
        }
        return;
      case 'message_stop':
      case 'ping':
        return;
      default:
        return;
    }
  }

  *finalize(): Generator<ResponsesStreamEvent, void, void> {
    const items: { index: number; item: ResponsesOutputItem }[] = [];

    if (this.textItem) {
      items.push({ index: this.textItemIndex, item: this.textItem });
    }

    for (const block of this.blocks.values()) {
      if (!block.item) {
        continue;
      }
      if (items.find((item) => item.index === block.outputIndex)) {
        continue;
      }
      // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
      const item: Record<string, unknown> = block.item as Record<string, unknown>;
      item.status = 'completed';
      if (block.type === 'tool_use') {
        // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
        const call = block.item as ResponsesOutputFunctionCall;
        if (call.name && SHELL_TOOL_NAMES.has(call.name)) {
          call.type = 'local_shell_call';
          const parsed = safeJsonParse<{ command?: string[] }>(call.arguments ?? '');
          call.action = { type: 'exec', command: parsed?.command ?? [] };
        }
      }
      items.push({ index: block.outputIndex, item: block.item });
    }

    items.sort((alpha, beta) => alpha.index - beta.index);

    for (const { index, item } of items) {
      yield this.makeEvent('response.output_item.done', {
        response_id: this.responseId,
        output_index: index,
        item,
      });
    }

    const output = items.map((item) => item.item);
    const total = this.inputTokens + this.outputTokens;

    const response: Partial<ResponsesResponse> = {
      id: this.responseId,
      object: 'response',
      created_at: this.createdAt,
      completed_at: Math.floor(Date.now() / 1000),
      model: this.model,
      status: 'completed',
      temperature: this.metadata.temperature,
      top_p: this.metadata.top_p,
      tool_choice: this.metadata.tool_choice,
      tools: this.metadata.tools ?? [],
      parallel_tool_calls: true,
      store: this.metadata.store ?? true,
      metadata: this.metadata.metadata ?? {},
      output,
      usage: {
        input_tokens: this.inputTokens,
        output_tokens: this.outputTokens,
        total_tokens: total,
        input_tokens_details: {
          cached_tokens: this.cacheReadTokens,
          cache_creation_tokens: this.cacheCreationTokens,
        },
      },
    };

    yield this.makeEvent('response.completed', { response });
  }

  private onMessageStart(event: Extract<AnthropicStreamEvent, { type: 'message_start' }>): void {
    const usage = event.message?.usage;
    if (usage) {
      this.inputTokens = usage.input_tokens ?? 0;
      this.cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
      this.cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    }
    return;
  }

  private *onContentBlockStart(
    event: Extract<AnthropicStreamEvent, { type: 'content_block_start' }>,
  ): Generator<ResponsesStreamEvent, void, void> {
    const index = event.index;
    const block: AnthropicContentBlock & { id?: string; name?: string } = event.content_block;
    const btype = block.type;

    if (btype === 'thinking') {
      const outputIndex = this.outputCounter++;
      const item: ResponsesOutputReasoning = {
        id: makeId('rs'),
        type: 'reasoning',
        summary: [],
        content: [{ type: 'reasoning_text', text: '' }],
        status: 'in_progress',
      };
      this.blocks.set(index, { type: 'thinking', outputIndex, item, buffer: '' });
      yield this.makeEvent('response.output_item.added', {
        response_id: this.responseId,
        output_index: outputIndex,
        item,
      });
      return;
    }

    if (btype === 'text') {
      if (!this.textItem) {
        const outputIndex = this.outputCounter++;
        this.textItemIndex = outputIndex;
        this.textItem = {
          id: makeId('msg'),
          type: 'message',
          role: 'assistant',
          status: 'in_progress',
          content: [{ type: 'output_text', text: '' }],
        };
        yield this.makeEvent('response.output_item.added', {
          response_id: this.responseId,
          output_index: outputIndex,
          item: this.textItem,
        });
      }
      this.blocks.set(index, { type: 'text', outputIndex: this.textItemIndex, buffer: '' });
      return;
    }

    if (btype === 'tool_use') {
      const outputIndex = this.outputCounter++;
      const callId = block.id ?? makeId('call');
      const item: ResponsesOutputFunctionCall = {
        id: callId,
        type: 'function_call',
        status: 'in_progress',
        name: block.name ?? '',
        arguments: '',
        call_id: callId,
      };
      this.blocks.set(index, { type: 'tool_use', outputIndex, item, buffer: '' });
      yield this.makeEvent('response.output_item.added', {
        response_id: this.responseId,
        output_index: outputIndex,
        item,
      });
      return;
    }

    this.blocks.set(index, { type: btype, outputIndex: -1, buffer: '' });
  }

  private *onContentBlockDelta(
    event: Extract<AnthropicStreamEvent, { type: 'content_block_delta' }>,
  ): Generator<ResponsesStreamEvent, void, void> {
    const block = this.blocks.get(event.index);
    if (!block) {
      return;
    }
    const delta: Record<string, unknown> = event.delta;
    const dtype: string = typeof delta.type === 'string' ? delta.type : '';

    if (dtype === 'text_delta') {
      const text = String(delta.text ?? '');
      if (!text) {
        return;
      }
      this.textBuffer += text;
      // text content available via this.textItem.content[0]
      yield this.makeEvent('response.output_text.delta', {
        response_id: this.responseId,
        item_id: this.textItem?.id ?? '',
        output_index: this.textItemIndex,
        content_index: 0,
        delta: text,
      });
      return;
    }

    if (dtype === 'thinking_delta') {
      const thinking = String(delta.thinking ?? '');
      if (!thinking) {
        return;
      }
      block.buffer += thinking;
      // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
      const item = block.item as ResponsesOutputReasoning | undefined;
      if (item) {
        item.content[0].text = block.buffer;
      }
      yield this.makeEvent('response.reasoning_text.delta', {
        response_id: this.responseId,
        item_id: item?.id ?? '',
        output_index: block.outputIndex,
        content_index: 0,
        delta: thinking,
      });
      return;
    }

    if (dtype === 'input_json_delta') {
      const partial = String(delta.partial_json ?? '');
      if (!partial) {
        return;
      }
      block.buffer += partial;
      // eslint-disable-next-line no-restricted-syntax -- TypeScript narrowing requires this cast
      const item = block.item as ResponsesOutputFunctionCall | undefined;
      if (item) {
        item.arguments = block.buffer;
      }
      yield this.makeEvent('response.function_call_arguments.delta', {
        response_id: this.responseId,
        item_id: item?.id ?? '',
        output_index: block.outputIndex,
        delta: partial,
      });
      return;
    }
  }

  private onMessageDelta(event: Extract<AnthropicStreamEvent, { type: 'message_delta' }>): void {
    if (event.usage?.output_tokens != null) {
      this.outputTokens = event.usage.output_tokens;
    }
    const eventDelta: { stop_reason?: string } | undefined = event.delta;
    const stopReason = eventDelta?.stop_reason;
    if (stopReason) {
      this.stopReason = stopReason;
    }
    return;
  }

  private makeEvent(type: string, data: Record<string, unknown>): ResponsesStreamEvent {
    this.seq += 1;
    return {
      id: makeId('evt'),
      object: 'response.event',
      type,
      created_at: Math.floor(Date.now() / 1000),
      sequence_number: this.seq,
      ...data,
    };
  }
}

// Suppress unused export warning
export type __AnthropicContentBlockAlias = AnthropicContentBlock;
