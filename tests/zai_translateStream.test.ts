import { describe, expect, it } from 'vitest';
import { translateStream } from '../src/translate/openai/translateStream.js';
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

// ==============================================================================
// translateStream (Zai -> Responses)
// ==============================================================================

describe('translateStream (Zai SSE -> Responses events)', () => {
  it('translates chat.completion chunks with text delta', async () => {
    const body = [
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Hello' },
            finish_reason: null,
          },
        ],
      }),
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: { content: ' world' },
            finish_reason: null,
          },
        ],
      }),
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      }),
    ].join('');

    const stream = makeByteStream([body]);
    const events: ResponsesStreamEvent[] = await collect(
      translateStream(stream, { model: 'zai-gpt-4' }),
    );

    expect(events[0]?.type).toBe('response.created');
    expect(events.some((evt) => evt.type === 'response.output_item.added')).toBe(true);
    const deltas = events.filter((evt) => evt.type === 'response.output_text.delta');
    expect(deltas.length).toBeGreaterThanOrEqual(1);
    const d0: { delta: string } = deltas[0];
    expect(d0.delta).toBe('Hello');

    const completed = events[events.length - 1];
    expect(completed?.type).toBe('response.completed');
    const completedResponse: { response: { usage: { output_tokens: number } } } = completed;
    const response = completedResponse.response;
    expect(response.usage.output_tokens).toBe(2);
  });

  it('translates tool_calls in stream', async () => {
    const body = [
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-456',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          },
        ],
      }),
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-456',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'search', arguments: '' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-456',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '{"q":' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-456',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: ' "test"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 20,
          total_tokens: 35,
        },
      }),
    ].join('');

    const stream = makeByteStream([body]);
    const events: ResponsesStreamEvent[] = await collect(
      translateStream(stream, { model: 'zai-gpt-4' }),
    );

    expect(events.some((evt) => evt.type === 'response.output_item.added')).toBe(true);
    const functionCallDeltas = events.filter((evt) => evt.type === 'response.output_item.done');
    expect(functionCallDeltas.length).toBeGreaterThan(0);
  });

  it('handles shell tool calls as local_shell_call', async () => {
    const body = [
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-789',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_shell',
                  type: 'function',
                  function: { name: 'shell', arguments: '{"command": ["ls", "-la"]}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 10,
          total_tokens: 15,
        },
      }),
    ].join('');

    const stream = makeByteStream([body]);
    const events: ResponsesStreamEvent[] = await collect(
      translateStream(stream, { model: 'zai-gpt-4' }),
    );

    const localShellCalls = events.filter(
      (evt: { type: string; item?: { type: string } }) =>
        evt.type === 'response.output_item.done' && evt.item?.type === 'local_shell_call',
    );
    expect(localShellCalls.length).toBeGreaterThan(0);
  });

  // ==============================================================================
  // Shell tool calls & edge cases
  // ==============================================================================

  it('handles custom responseId and createdAt', async () => {
    const body = [
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-custom',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: { content: 'test' },
            finish_reason: 'stop',
          },
        ],
      }),
    ].join('');

    const stream = makeByteStream([body]);
    const events: ResponsesStreamEvent[] = await collect(
      translateStream(stream, { responseId: 'custom_id', createdAt: 1234567890 }),
    );

    const found = events.find((evt) => evt.type === 'response.created');
    const createdEvent: { response: { id: string; created_at: number } } = found;
    expect(createdEvent?.response?.id).toBe('custom_id');
    expect(createdEvent?.response?.created_at).toBe(1234567890);
  });

  it('handles empty content gracefully', async () => {
    const body = [
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-empty',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
      }),
    ].join('');

    const stream = makeByteStream([body]);
    const events: ResponsesStreamEvent[] = await collect(
      translateStream(stream, { model: 'zai-gpt-4' }),
    );

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]?.type).toBe('response.completed');
  });

  it('handles [DONE] termination', async () => {
    const body = [
      encodeSseEvent('chat.completion.chunk', {
        id: 'chatcmpl-done',
        object: 'chat.completion.chunk',
        created: 1677652288,
        model: 'zai-gpt-4',
        choices: [
          {
            index: 0,
            delta: { content: 'test' },
            finish_reason: null,
          },
        ],
      }),
      'data: [DONE]\n\n',
    ].join('');

    const stream = makeByteStream([body]);
    const events: ResponsesStreamEvent[] = await collect(
      translateStream(stream, { model: 'zai-gpt-4' }),
    );

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]?.type).toBe('response.completed');
  });
});
