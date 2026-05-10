import { afterAll, describe, expect, it } from 'vitest';
import { startProxy, flattenIncomingHeaders } from '../src/server/proxy.js';
import { existsSync, rmSync } from 'node:fs';

describe('proxy remaining edge cases', () => {
  afterAll(() => {
    const logsDir = process.cwd() + '/logs';
    if (existsSync(logsDir)) {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  describe('flattenIncomingHeaders', () => {
    it('skips null values', () => {
      // eslint-disable-next-line no-restricted-syntax
      const result = flattenIncomingHeaders({ 'x-key': null as unknown as string });
      expect(result).toEqual({});
    });

    it('skips undefined values', () => {
      // eslint-disable-next-line no-restricted-syntax
      const result = flattenIncomingHeaders({ 'x-key': undefined as unknown as string });
      expect(result).toEqual({});
    });

    it('joins array values', () => {
      const result = flattenIncomingHeaders({ 'set-cookie': ['a=1', 'b=2'] });
      expect(result['set-cookie']).toBe('a=1, b=2');
    });

    it('handles string values', () => {
      const result = flattenIncomingHeaders({ 'content-type': 'application/json' });
      expect(result['content-type']).toBe('application/json');
    });

    it('lowercases keys', () => {
      const result = flattenIncomingHeaders({ 'X-Custom-Header': 'value' });
      expect(result['x-custom-header']).toBe('value');
    });
  });

  it('writes status log for successful response with logger', async () => {
    const okUpstream: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'Hi' }],
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: okUpstream,
      logger: console,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-test',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello' }),
    });
    expect(res.status).toBe(200);
    await res.json();
    await proxy.close();
  });

  it('triggers onCacheStats with cache creation tokens', async () => {
    let capturedStats: {
      cachedTokens: number;
      cacheCreationTokens: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    } | null = null;

    const okFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'Hi' }],
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            cache_read_input_tokens: 5,
            cache_creation_input_tokens: 3,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: okFetch,
      logger: null,
      onCacheStats: (stats) => {
        capturedStats = stats;
      },
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-test',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello' }),
    });
    expect(res.status).toBe(200);
    await res.json();
    await new Promise<void>((ok) => setTimeout(ok, 50));
    expect(capturedStats).not.toBeNull();
    await proxy.close();
  });
});
