import { describe, expect, it } from 'vitest';
import { startProxy } from '../src/server/proxy.js';

describe('proxy error handling', () => {
  it('generates error dump and returns 500 from upstream', async () => {
    const mockErrorUpstream: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: { message: 'Upstream error' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    };

    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: mockErrorUpstream satisfies typeof fetch,
      logger: null,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-test',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello' }),
    });
    expect(res.status).toBe(500);

    await proxy.close();
  });

  it('handles upstream 400 error (non-JSON body)', async () => {
    const badUpstream: typeof fetch = async () => {
      return new Response('Bad Request', {
        status: 400,
        headers: { 'content-type': 'text/plain' },
      });
    };

    const proxy = await startProxy({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      host: '127.0.0.1',
      port: 0,
      fetch: badUpstream satisfies typeof fetch,
      logger: null,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-test',
      },
      body: JSON.stringify({ model: 'gpt-4', input: 'Hello' }),
    });
    expect(res.status).toBe(400);

    await proxy.close();
  });

  it('handles CORS disabled', async () => {
    const simpleUpstream: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'Hi' }],
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
      fetch: simpleUpstream satisfies typeof fetch,
      cors: false,
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
