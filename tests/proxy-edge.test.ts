import { describe, expect, it } from 'vitest';
import { startProxy } from '../src/server/proxy.js';

describe('proxy edge cases', () => {
  it('handles upstream fetch rejection (500 internal error)', async () => {
    const rejectingFetch: typeof fetch = async () => {
      throw new Error('Connection refused');
    };

    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: rejectingFetch,
      logger: null,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: 'Hello' }),
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.message).toBe('Internal server error');
    await proxy.close();
  });

  it('handles upstream with empty body responses through core translation', async () => {
    const emptyBodyFetch: typeof fetch = async () => {
      return new Response('', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    };

    const proxy = await startProxy({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://api.openai.com/v1/chat/completions',
      host: '127.0.0.1',
      port: 0,
      fetch: emptyBodyFetch,
      logger: null,
      cors: false,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4', input: 'Hi' }),
    });

    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    await proxy.close();
  });
});
