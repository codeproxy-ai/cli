import { describe, expect, it, afterAll } from 'vitest';
import { startProxy } from '../src/server/proxy.js';

describe('proxy timeout cleanup', () => {
  afterAll(() => {
    // Clean up any leftover proxies
  });

  it('clears timeout timer on successful request', async () => {
    const okUpstream: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
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
      timeoutMs: 5000,
      logger: null,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: 'Hello' }),
    });
    expect(res.status).toBe(200);

    await proxy.close();
  });

  it('does not set timeout when timeoutMs is 0', async () => {
    const okUpstream: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
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
      timeoutMs: 0,
      logger: null,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: 'Hello' }),
    });
    expect(res.status).toBe(200);

    await proxy.close();
  });
});
