/* eslint-disable max-lines */
import { describe, expect, it } from 'vitest';
import { createResponsesFetch } from '../src/fetch.js';
import { encodeSseEvent, parseSseStream } from '../src/utils/sse.js';

function mockAnthropicStream(events: Array<{ type: string; data: unknown }>): typeof fetch {
  return async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const e of events) {
          controller.enqueue(encoder.encode(encodeSseEvent(e.type, e.data)));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };
}

describe('createResponsesFetch', () => {
  it('translates /responses JSON + forwards Bearer auth as x-api-key', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    let capturedHeaders: Record<string, string> = {};

    const upstream: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedBody = String(init?.body ?? '');
      // eslint-disable-next-line no-restricted-syntax -- test needs to capture headers as Record
      const hdrs_capture: Record<string, string> = (init?.headers ?? {}) as Record<string, string>;
      capturedHeaders = Object.fromEntries(Object.entries(hdrs_capture));
      return new Response(
        JSON.stringify({
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'text', text: 'Hi there!' }],
          usage: { input_tokens: 3, output_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      fetch: upstream,
    });

    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-ant-test',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hello' }),
    });

    expect(res.status).toBe(200);
    const json: { output: unknown[]; usage: { total_tokens: number } } = await res.json();
    expect(json.usage.total_tokens).toBe(5);

    expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
    expect(capturedHeaders['x-api-key']).toBe('sk-ant-test');
    expect(capturedHeaders['authorization']).toBeUndefined();
    expect(capturedHeaders['anthropic-version']).toBe('2023-06-01');

    const upstreamBody = JSON.parse(capturedBody);
    expect(upstreamBody.messages[0].content[0].text).toBe('Hello');
  });

  it('passes an existing x-api-key header through untouched', async () => {
    let captured: Record<string, string> = {};
    const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      // eslint-disable-next-line no-restricted-syntax -- test needs to capture headers as Record
      const hdrs_cap2: Record<string, string> = (init?.headers ?? {}) as Record<string, string>;
      captured = Object.fromEntries(Object.entries(hdrs_cap2));
      return new Response(
        JSON.stringify({
          id: 'x',
          type: 'message',
          role: 'assistant',
          model: 'claude',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      fetch: upstream,
    });
    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'x-api-key': 'explicit-key' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'hi' }),
    });
    expect(captured['x-api-key']).toBe('explicit-key');
  });

  it('drops incoming user-agent and forwards defaultHeaders user-agent to upstream', async () => {
    let captured: Record<string, string> = {};
    const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      // eslint-disable-next-line no-restricted-syntax -- test needs to capture headers as Record
      const hdrs_cap2: Record<string, string> = (init?.headers ?? {}) as Record<string, string>;
      captured = Object.fromEntries(Object.entries(hdrs_cap2));
      return new Response(
        JSON.stringify({
          id: 'c1',
          object: 'chat.completion',
          model: 'kimi-for-coding',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://api.kimi.com/coding/v1',
      fetch: upstream,
      defaultHeaders: { 'user-agent': 'claude-cli/1.0.0 (external, cli)' },
    });

    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'codex-cli/9.9.9',
        authorization: 'Bearer sk-test',
      },
      body: JSON.stringify({ model: 'kimi-for-coding', input: 'hi' }),
    });

    expect(captured['user-agent']).toBe('claude-cli/1.0.0 (external, cli)');
    expect(captured['authorization']).toBe('Bearer sk-test');
  });

  it('re-emits a streaming /responses request as SSE', async () => {
    const upstream = mockAnthropicStream([
      {
        type: 'message_start',
        data: {
          type: 'message_start',
          message: {
            id: 'msg',
            type: 'message',
            role: 'assistant',
            model: 'claude',
            content: [],
            usage: { input_tokens: 1, output_tokens: 0 },
          },
        },
      },
      {
        type: 'content_block_start',
        data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      },
      {
        type: 'content_block_delta',
        data: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hi' },
        },
      },
      { type: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
      {
        type: 'message_delta',
        data: {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 1 },
        },
      },
      { type: 'message_stop', data: { type: 'message_stop' } },
    ]);
    // ==============================================================================
    // Responses JSON translation
    // ==============================================================================

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      fetch: upstream,
    });

    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer sk-ant-test',
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'Hi', stream: true }),
    });

    expect(res.headers.get('content-type')?.startsWith('text/event-stream')).toBe(true);
    const parsedEvents: string[] = [];
    let textDelta = '';
    for await (const msg of parseSseStream(res.body!)) {
      if (msg.data === '[DONE]') {
        parsedEvents.push('DONE');
        break;
      }
      const payload: { type: string; delta?: string } = JSON.parse(msg.data);
      parsedEvents.push(payload.type);
      if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
        textDelta += payload.delta;
      }
    }
    expect(parsedEvents[0]).toBe('response.created');
    expect(parsedEvents[parsedEvents.length - 1]).toBe('DONE');
    expect(textDelta).toBe('Hi');
  });

  it('forwards non-/responses paths to passthrough fetch', async () => {
    let passthroughCalled = false;
    const passthrough: typeof fetch = async () => {
      passthroughCalled = true;
      return new Response('ok');
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      fetch: async () => new Response('{}'),
      passthroughFetch: passthrough,
    });

    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: '{}',
    });
    expect(passthroughCalled).toBe(true);
    expect(await res.text()).toBe('ok');
  });

  it('translates upstream errors to OpenAI-style error JSON', async () => {
    const upstream: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: { message: 'bad key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      fetch: upstream,
    });
    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: 'Bearer x' },
      body: JSON.stringify({ model: 'claude-sonnet-4-5', input: 'x' }),
    });
    expect(res.status).toBe(401);
    const body: { error: { message: string } } = await res.json();
    expect(body.error.message).toContain('bad key');
  });
});

it('drops image_url parts from user messages when dropImages is true', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'deepseek-v4-flash',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'openai-chat',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    fetch: upstream,
    dropImages: true,
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'desc' },
            { type: 'input_image', image_url: 'https://example.com/img.png' },
          ],
        },
      ],
    }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  const userMsg = upstreamBody.messages.find((msg: { role: string }) => msg.role === 'user');
  // Should contain only the text part, image dropped
  expect(Array.isArray(userMsg.content)).toBe(true);
  expect(userMsg.content).toHaveLength(1);
  expect(userMsg.content[0].type).toBe('text');
  expect(userMsg.content[0].text).toBe('desc');
});
// ==============================================================================
// Image dropping & format defaults
// ==============================================================================

it('drops image_url parts from assistant messages when dropImages is true', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1677652288,
        model: 'deepseek-v4-flash',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'openai-chat',
    baseUrl: 'https://my-proxy.com/v1/chat/completions',
    fetch: upstream,
    dropImages: true,
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({
      model: 'test-model',
      input: [
        { type: 'message', role: 'user', content: 'hello' },
        {
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'sure' },
            { type: 'input_image', image_url: 'data:image/png;base64,ABC' },
          ],
        },
      ],
    }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  const assistantMsg = upstreamBody.messages.find(
    (msg: { role: string }) => msg.role === 'assistant',
  );
  // Assistant messages get concatenated to plain string (image parts dropped)
  expect(typeof assistantMsg.content).toBe('string');
  expect(assistantMsg.content).toBe('sure');
});

it('defaults to openai-chat when upstreamFormat cannot be inferred from baseUrl', async () => {
  let capturedUrl = '';
  const upstream: typeof fetch = async (input: RequestInfo | URL) => {
    capturedUrl = typeof input === 'string' ? input : input.toString();
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: 'glm-5.1',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    fetch: upstream,
  });

  const res = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({
      model: 'glm-5.1',
      input: [{ type: 'message', role: 'user', content: 'hi' }],
    }),
  });

  expect(res.status).toBe(200);
  expect(capturedUrl).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
});

it('injects reasoning_effort for openai-chat upstream', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-r1',
        object: 'chat.completion',
        created: 1,
        model: 'deepseek-v4-pro',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'openai-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    fetch: upstream,
    reasoning_effort: 'high',
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({ model: 'deepseek-v4-pro', input: 'hello' }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  expect(upstreamBody.reasoning_effort).toBe('high');
});

it('injects thinking for openai-chat upstream', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-t1',
        object: 'chat.completion',
        created: 1,
        model: 'glm-5.1',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'openai-chat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    fetch: upstream,
    thinking: { type: 'enabled' },
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({ model: 'glm-5.1', input: 'hello' }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  expect(upstreamBody.thinking).toEqual({ type: 'enabled' });
});

it('injects thinking:disabled for anthropic upstream when reasoning_effort is minimal', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-7',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  // ==============================================================================
  // Reasoning & thinking injection
  // ==============================================================================

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    fetch: upstream,
    reasoning_effort: 'minimal',
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({ model: 'claude-sonnet-4-7', input: 'hello' }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  expect(upstreamBody.thinking).toEqual({ type: 'disabled' });
});

it('injects thinking:enabled with budget for anthropic upstream when reasoning_effort is high', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-7',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    fetch: upstream,
    reasoning_effort: 'high',
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({ model: 'claude-sonnet-4-7', input: 'hello' }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  expect(upstreamBody.thinking).toEqual({ type: 'enabled', budget_tokens: 32768 });
});

it('injects raw thinking config for anthropic upstream when thinking is provided (overrides reasoning_effort)', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'msg_3',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-7',
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    fetch: upstream,
    reasoning_effort: 'high',
    thinking: { type: 'disabled' },
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({ model: 'claude-sonnet-4-7', input: 'hello' }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  // thinking should win over reasoning_effort
  expect(upstreamBody.thinking).toEqual({ type: 'disabled' });
});

it('does not inject reasoning_effort when not configured', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-nr',
        object: 'chat.completion',
        created: 1,
        model: 'deepseek-v4-flash',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'openai-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    fetch: upstream,
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({ model: 'deepseek-v4-flash', input: 'hello' }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  expect(upstreamBody.reasoning_effort).toBeUndefined();
  expect(upstreamBody.thinking).toBeUndefined();
});

describe('config headers', () => {
  it('merges root-level defaultHeaders into upstream request', async () => {
    let capturedHeaders: Record<string, string> = {};
    const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      // eslint-disable-next-line no-restricted-syntax -- test needs to capture headers as Record
      const hdrs_capture: Record<string, string> = (init?.headers ?? {}) as Record<string, string>;
      capturedHeaders = Object.fromEntries(Object.entries(hdrs_capture));
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-h1',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://api.openai.com/v1',
      fetch: upstream,
      defaultHeaders: { 'x-custom-header': 'root-value' },
    });
    // ==============================================================================
    // Config headers
    // ==============================================================================

    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({ model: 'gpt-4', input: 'hello' }),
    });

    expect(capturedHeaders['x-custom-header']).toBe('root-value');
  });

  it('root-level headers appear in cli config loading', async () => {
    // Simulate the config loading logic from cli.ts
    const config = {
      version: '1.0',
      currentUpstream: 'test',
      headers: { 'x-root-header': 'root-val' },
      upstreams: {
        test: {
          baseUrl: 'https://api.openai.com/v1',
          headers: { 'x-upstream-header': 'upstream-val' },
        },
      },
    };

    const defaultHeaders: Record<string, string> = {
      ...(config.headers ?? {}),
    };
    const upstreamConfig = config.upstreams[config.currentUpstream];
    if (upstreamConfig.headers) {
      Object.assign(defaultHeaders, upstreamConfig.headers);
    }

    expect(defaultHeaders['x-root-header']).toBe('root-val');
    expect(defaultHeaders['x-upstream-header']).toBe('upstream-val');
  });

  it('upstream headers override root-level headers with same key', async () => {
    const config = {
      version: '1.0',
      currentUpstream: 'test',
      headers: { 'x-custom': 'root-val' },
      upstreams: {
        test: {
          baseUrl: 'https://api.openai.com/v1',
          headers: { 'x-custom': 'upstream-val' },
        },
      },
    };

    const defaultHeaders: Record<string, string> = {
      ...(config.headers ?? {}),
    };
    const upstreamConfig = config.upstreams[config.currentUpstream];
    if (upstreamConfig.headers) {
      Object.assign(defaultHeaders, upstreamConfig.headers);
    }

    expect(defaultHeaders['x-custom']).toBe('upstream-val');
  });

  it('apiKey adds Bearer auth header alongside root headers', async () => {
    const config = {
      version: '1.0',
      currentUpstream: 'test',
      headers: { 'x-root-header': 'root-val' },
      upstreams: {
        test: {
          baseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test-key',
        },
      },
    };

    const defaultHeaders: Record<string, string> = {
      ...(config.headers ?? {}),
    };
    const upstreamConfig = config.upstreams[config.currentUpstream];
    if (upstreamConfig.headers) {
      Object.assign(defaultHeaders, upstreamConfig.headers);
    }
    if (upstreamConfig.apiKey) {
      defaultHeaders.authorization = `Bearer ${upstreamConfig.apiKey}`;
    }

    expect(defaultHeaders['x-root-header']).toBe('root-val');
    expect(defaultHeaders['authorization']).toBe('Bearer sk-test-key');
  });

  it('loads reasoningEffort from upstream config', async () => {
    // Simulate the config loading logic from cli.ts
    const config = {
      version: '1.0',
      currentUpstream: 'test',
      upstreams: {
        test: { baseUrl: 'https://api.openai.com/v1', reasoningEffort: 'high' },
      },
    };

    const upstreamConfig = config.upstreams[config.currentUpstream];
    const reasoning_effort =
      upstreamConfig.reasoningEffort ??
      // eslint-disable-next-line no-restricted-syntax -- test needs wider type for reasoningEffort
      (config as Record<string, unknown>).reasoningEffort;
    expect(reasoning_effort).toBe('high');
  });

  it('loads reasoningEffort from root config as fallback', async () => {
    const config = {
      version: '1.0',
      currentUpstream: 'test',
      reasoningEffort: 'low',
      upstreams: {
        test: { baseUrl: 'https://api.openai.com/v1' },
      },
    };

    const upstreamConfig = config.upstreams[config.currentUpstream];
    const reasoning_effort = upstreamConfig.reasoningEffort ?? config.reasoningEffort;
    expect(reasoning_effort).toBe('low');
  });

  it('upstream reasoningEffort overrides root reasoningEffort', async () => {
    const config = {
      version: '1.0',
      currentUpstream: 'test',
      reasoningEffort: 'low',
      upstreams: {
        test: { baseUrl: 'https://api.openai.com/v1', reasoningEffort: 'medium' },
      },
    };

    const upstreamConfig = config.upstreams[config.currentUpstream];
    const reasoning_effort = upstreamConfig.reasoningEffort ?? config.reasoningEffort;
    expect(reasoning_effort).toBe('medium');
  });
});

describe('fallback upstream', () => {
  it('routes to fallback when last user message has an image', async () => {
    let capturedUrl = '';
    const upstream: typeof fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-fb',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    // ==============================================================================
    // Fallback upstream routing
    // ==============================================================================

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://primary.com/v1',
      fetch: upstream,
      dropImages: true,
      fallbackUpstream: { baseUrl: 'https://fallback.com/v1' },
    });

    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        model: 'gpt-4',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: 'desc' },
              { type: 'input_image', image_url: 'https://example.com/img.png' },
            ],
          },
        ],
      }),
    });

    expect(capturedUrl).toBe('https://fallback.com/v1/chat/completions');
  });

  it('stays on primary when last user message has no image (even if older ones did)', async () => {
    let capturedUrl = '';
    const upstream: typeof fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-pr',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://primary.com/v1',
      fetch: upstream,
      dropImages: true,
      fallbackUpstream: { baseUrl: 'https://fallback.com/v1' },
    });

    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        model: 'gpt-4',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: 'old image' },
              { type: 'input_image', image_url: 'https://example.com/old.png' },
            ],
          },
          { type: 'message', role: 'assistant', content: 'reply' },
          { type: 'message', role: 'user', content: 'text-only follow-up' },
        ],
      }),
    });

    expect(capturedUrl).toBe('https://primary.com/v1/chat/completions');
  });

  it('stays on primary when all user messages are text-only', async () => {
    let capturedUrl = '';
    const upstream: typeof fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-pr',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://primary.com/v1',
      fetch: upstream,
      dropImages: true,
      fallbackUpstream: { baseUrl: 'https://fallback.com/v1' },
    });

    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        model: 'gpt-4',
        input: [{ type: 'message', role: 'user', content: 'plain text' }],
      }),
    });

    expect(capturedUrl).toBe('https://primary.com/v1/chat/completions');
  });

  it('preserves images in translated body when using fallback', async () => {
    let capturedBody = '';
    const upstream: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-fb',
          object: 'chat.completion',
          created: 1,
          model: 'gpt-4',
          choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://primary.com/v1',
      fetch: upstream,
      dropImages: true,
      fallbackUpstream: { baseUrl: 'https://fallback.com/v1' },
    });

    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        model: 'gpt-4',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: 'desc' },
              { type: 'input_image', image_url: 'https://example.com/img.png' },
            ],
          },
        ],
      }),
    });
    // ==============================================================================
    // Fallback model
    // ==============================================================================

    const upstreamBody = JSON.parse(capturedBody);
    const userMsg = upstreamBody.messages.find((msg: { role: string }) => msg.role === 'user');
    const imageParts = userMsg.content.filter(
      (part: { type: string }) => part.type === 'image_url',
    );
    expect(imageParts).toHaveLength(1);
  });

  it('uses fallback upstream format when configured', async () => {
    let capturedUrl = '';
    const upstream: typeof fetch = async (input: RequestInfo | URL, _init?: RequestInit) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      return new Response(
        JSON.stringify({
          id: 'msg_fb',
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-7',
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const fetchImpl = createResponsesFetch({
      upstreamFormat: 'openai-chat',
      baseUrl: 'https://primary.com/v1',
      fetch: upstream,
      dropImages: true,
      fallbackUpstream: {
        baseUrl: 'https://api.anthropic.com/v1/messages',
        upstreamFormat: 'anthropic',
      },
    });

    await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-7',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: 'desc' },
              { type: 'input_image', image_url: 'https://example.com/img.png' },
            ],
          },
        ],
      }),
    });

    expect(capturedUrl).toBe('https://api.anthropic.com/v1/messages');
    expect(capturedUrl).not.toContain('/chat/completions');
  });
});

it('uses fallback model when configured', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-fb2',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-5.4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'openai-chat',
    baseUrl: 'https://primary.com/v1',
    model: 'primary-model',
    fetch: upstream,
    dropImages: true,
    fallbackUpstream: {
      baseUrl: 'https://fallback.com/v1',
      model: 'gpt-5.4',
    },
  });

  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'desc' },
            { type: 'input_image', image_url: 'https://example.com/img.png' },
          ],
        },
      ],
    }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  expect(upstreamBody.model).toBe('gpt-5.4');
});

it('uses fallback model when configured without dropImages (direct model override)', async () => {
  let capturedBody = '';
  const upstream: typeof fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedBody = String(init?.body ?? '');
    return new Response(
      JSON.stringify({
        id: 'chatcmpl-fb3',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-5.4',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const fetchImpl = createResponsesFetch({
    upstreamFormat: 'openai-chat',
    baseUrl: 'https://primary.com/v1',
    model: 'deepseek-v4-flash',
    fetch: upstream,
    fallbackUpstream: {
      baseUrl: 'https://fallback.com/v1',
      model: 'gpt-5.4',
    },
  });

  // No images in request — fallback should not trigger, model stays as primary
  await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
    body: JSON.stringify({
      model: 'something',
      input: 'hello',
    }),
  });

  const upstreamBody = JSON.parse(capturedBody);
  // Primary model is used, not fallback
  expect(upstreamBody.model).toBe('deepseek-v4-flash');
});
// ==============================================================================
// Direct model override
// ==============================================================================
