import { describe, expect, it } from 'vitest';
import { translateStream } from '../src/translate/anthropic/translateStream.js';
import { encodeSseEvent } from '../src/utils/sse.js';
import type { ResponsesStreamEvent } from '../src/types/responses.js';

function makeByteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('translateStream (Anthropic SSE -> Responses events)', () => {
  it('translates message_start + text_delta + message_stop', async () => {
    const body = [
      encodeSseEvent('message_start', {
        type: 'message_start',
        message: {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude',
          content: [],
          usage: { input_tokens: 5, output_tokens: 0 },
        },
      }),
      encodeSseEvent('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      }),
      encodeSseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      }),
      encodeSseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' world' },
      }),
      encodeSseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
      encodeSseEvent('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 2 },
      }),
      encodeSseEvent('message_stop', { type: 'message_stop' }),
    ].join('');

    const stream = makeByteStream([body]);
    const events: ResponsesStreamEvent[] = await collect(
      translateStream(stream, { model: 'claude-sonnet-4-5' }),
    );

    expect(events[0]?.type).toBe('response.created');
    expect(events.some((evt) => evt.type === 'response.output_item.added')).toBe(true);
    const deltas = events.filter((evt) => evt.type === 'response.output_text.delta');
    expect(deltas.length).toBe(2);
    const d0: { delta: string } = deltas[0]!;
    expect(d0.delta).toBe('Hello');

    const completed = events[events.length - 1];
    expect(completed?.type).toBe('response.completed');
    const comp: { response: { output: unknown[]; usage: { output_tokens: number } } } = completed!;
    const response = comp.response;
    expect(response.usage.output_tokens).toBe(2);
    expect(response.output.length).toBe(1);
  });

  it('translates tool_use with input_json_delta', async () => {
    const body = [
      encodeSseEvent('message_start', {
        type: 'message_start',
        message: {
          id: 'msg_2',
          type: 'message',
          role: 'assistant',
          model: 'claude',
          content: [],
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      }),
      encodeSseEvent('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'call_1', name: 'search', input: {} },
      }),
      encodeSseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"q":"' },
      }),
      encodeSseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: 'hi"}' },
      }),
      encodeSseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
      encodeSseEvent('message_stop', { type: 'message_stop' }),
    ].join('');

    const events = await collect(translateStream(makeByteStream([body])));
    const done = events.find((evt) => evt.type === 'response.output_item.done');
    expect(done).toBeDefined();
    const doneItem: { item: { name: string; arguments: string; call_id: string } } = done!;
    const item = doneItem.item;
    expect(item.name).toBe('search');
    expect(item.arguments).toBe('{"q":"hi"}');
    expect(item.call_id).toBe('call_1');
  });
});
