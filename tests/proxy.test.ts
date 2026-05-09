import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startProxy, type RunningProxy } from '../src/server/proxy.js';

function mockUpstream(): {
  fetch: typeof fetch;
  lastHeaders: () => Record<string, string>;
  lastBody: () => string;
} {
  let headers: Record<string, string> = {};
  let body = '';
  const impl: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    body = String(init?.body ?? '');
    // eslint-disable-next-line no-restricted-syntax -- test needs to capture headers as Record
    const hdrs: Record<string, string> = (init?.headers ?? {}) as Record<string, string>;
    headers = Object.fromEntries(Object.entries(hdrs));
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: 'Hi from proxy' }],
        usage: { input_tokens: 4, output_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  return { fetch: impl, lastHeaders: () => headers, lastBody: () => body };
}

describe('startProxy', () => {
  let proxy: RunningProxy;
  let upstream: ReturnType<typeof mockUpstream>;

  beforeAll(async () => {
    upstream = mockUpstream();
    proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: upstream.fetch,
      logger: null,
    });
  });

  afterAll(async () => {
    await proxy.close();
  });

  it('translates POST /v1/responses through HTTP', async () => {
    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-ant-test',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello' }),
    });
    expect(res.status).toBe(200);
    const json: { output: unknown[]; usage: { total_tokens: number } } = await res.json();
    expect(json.usage.total_tokens).toBe(6);
    expect(upstream.lastHeaders()['x-api-key']).toBe('sk-ant-test');
    const upstreamBody = JSON.parse(upstream.lastBody());
    expect(upstreamBody.messages[0].content[0].text).toBe('Hello');
  });

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${proxy.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('handles CORS preflight', async () => {
    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});
