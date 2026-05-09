import { describe, expect, it } from 'vitest';
import { createResponsesFetch, type CacheStats } from '../src/fetch.js';

describe('cache logging', () => {
  it('collects cache stats from non-streaming response', async () => {
    let capturedStats: CacheStats | undefined;

    const mockFetch = async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'Hi from proxy' }],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 75,
            cache_creation_input_tokens: 25,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetch = createResponsesFetch({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      fetch: mockFetch,
      onCacheStats: (stats) => {
        capturedStats = stats;
      },
    });

    const res = await fetch('http://local/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello' }),
    });

    expect(res.status).toBe(200);
    expect(capturedStats).toBeDefined();
    expect(capturedStats!.cachedTokens).toBe(75);
    expect(capturedStats!.cacheCreationTokens).toBe(25);
    expect(capturedStats!.inputTokens).toBe(100);
    expect(capturedStats!.outputTokens).toBe(50);
  });

  it('collects cache stats from streaming response', async () => {
    let capturedStats: CacheStats | undefined;

    const mockStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        // Send message_start event with usage
        controller.enqueue(
          encoder.encode(
            'data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_creation_input_tokens":25,"cache_read_input_tokens":75}}}\n\n',
          ),
        );
        // Send content_block_start
        controller.enqueue(
          encoder.encode(
            'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          ),
        );
        // Send content_block_delta
        controller.enqueue(
          encoder.encode(
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
          ),
        );
        // Send message_delta with output tokens
        controller.enqueue(
          encoder.encode(
            'data: {"type":"message_delta","delta":{},"usage":{"output_tokens":50}}\n\n',
          ),
        );
        // Send message_stop
        controller.enqueue(encoder.encode('data: {"type":"message_stop"}\n\n'));
        controller.close();
      },
    });

    const mockFetch = async (_input: RequestInfo | URL, __init?: RequestInit) => {
      return new Response(mockStream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    };

    const fetch = createResponsesFetch({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      fetch: mockFetch,
      onCacheStats: (stats) => {
        capturedStats = stats;
      },
    });

    const res = await fetch('http://local/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello', stream: true }),
    });

    expect(res.status).toBe(200);

    // Consume the stream to trigger the cache stats callback
    const reader = res.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) {
          break;
        }
      }
    }

    // Give time for the callback to be called
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(capturedStats).toBeDefined();
    expect(capturedStats!.cachedTokens).toBe(75);
    expect(capturedStats!.cacheCreationTokens).toBe(25);
    expect(capturedStats!.inputTokens).toBe(100);
    expect(capturedStats!.outputTokens).toBe(50);
  });
});
