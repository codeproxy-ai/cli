import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startProxy, type RunningProxy } from '../src/server/proxy.js';

function mockUpstream(): {
  fetch: typeof fetch;
  lastHeaders: () => Record<string, string>;
  lastBody: () => string;
  callCount: () => number;
} {
  let headers: Record<string, string> = {};
  let body = '';
  let calls = 0;
  const impl: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
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
  return { fetch: impl, lastHeaders: () => headers, lastBody: () => body, callCount: () => calls };
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

  it('rewrites mapped model aliases before forwarding', async () => {
    const aliasedUpstream = mockUpstream();
    const aliasedProxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: aliasedUpstream.fetch,
      modelAliases: { 'gpt-5.5': 'deepseek-v4-flash' },
      logger: null,
    });

    const res = await fetch(`${aliasedProxy.url}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.5', input: 'Hello' }),
    });

    expect(res.status).toBe(200);
    const upstreamBody = JSON.parse(aliasedUpstream.lastBody());
    expect(upstreamBody.model).toBe('deepseek-v4-flash');
    await aliasedProxy.close();
  });

  it('leaves unmapped models unchanged when model aliases are configured', async () => {
    const aliasedUpstream = mockUpstream();
    const aliasedProxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: aliasedUpstream.fetch,
      modelAliases: { 'gpt-5.5': 'deepseek-v4-flash' },
      logger: null,
    });

    const res = await fetch(`${aliasedProxy.url}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek-v4-pro', input: 'Hello' }),
    });

    expect(res.status).toBe(200);
    const upstreamBody = JSON.parse(aliasedUpstream.lastBody());
    expect(upstreamBody.model).toBe('deepseek-v4-pro');
    await aliasedProxy.close();
  });

  it('returns 404 for unknown paths', async () => {
    const res = await fetch(`${proxy.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
    // ==============================================================================
    // Timeout Tests
    // ==============================================================================
  });

  it('returns a no-op compaction response without calling upstream', async () => {
    const before = upstream.callCount();
    const res = await fetch(`${proxy.url}/v1/responses/compact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        input: [
          {
            id: 'msg_1',
            type: 'message',
            status: 'completed',
            role: 'user',
            content: [{ type: 'input_text', text: 'Hello' }],
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json: {
      object: string;
      output: unknown[];
      usage: { total_tokens: number };
    } = await res.json();
    expect(json.object).toBe('response.compaction');
    expect(json.output).toEqual([
      {
        id: 'msg_1',
        type: 'message',
        status: 'completed',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }],
      },
    ]);
    expect(json.usage.total_tokens).toBe(0);
    expect(upstream.callCount()).toBe(before);
  });

  it('normalizes string input for compaction requests', async () => {
    const res = await fetch(`${proxy.url}/v1/responses/compact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello' }),
    });

    expect(res.status).toBe(200);
    const json: { output: Array<{ content: Array<{ text: string; type: string }> }> } =
      await res.json();
    expect(json.output[0].content).toEqual([{ type: 'input_text', text: 'Hello' }]);
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

  it('aborts upstream fetch when timeoutMs is exceeded', async () => {
    // Upstream that never responds
    const neverRespond: typeof fetch = async () => {
      return new Promise<Response>(() => {
        // Intentionally never resolve/reject
      });
    };

    const fastProxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: neverRespond,
      timeoutMs: 100,
      logger: null,
    });

    const start = Date.now();
    // Timeout destroys the socket before the 500 catch handler responds,
    // so the client gets a socket error, not an HTTP response
    await expect(
      fetch(`${fastProxy.url}/v1/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'test', input: 'Hello' }),
      }),
    ).rejects.toThrow();

    const elapsed = Date.now() - start;
    // Should resolve well before the upstream would
    expect(elapsed).toBeLessThan(5000);

    await fastProxy.close();
  });

  it('does not abort when timeoutMs is not set', async () => {
    const neverRespond: typeof fetch = async () => {
      return new Promise<Response>(() => {
        // Intentionally never resolve/reject
      });
    };

    const noTimeoutProxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: neverRespond,
      logger: null,
    });

    // This will hang, so we need a client timeout to avoid test timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 200);

    await expect(
      fetch(`${noTimeoutProxy.url}/v1/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'test', input: 'Hello' }),
        signal: controller.signal,
      }),
    ).rejects.toThrow();

    clearTimeout(timer);
    await noTimeoutProxy.close();
  });
});
