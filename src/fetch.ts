// ==============================================================================
// URL & Format Helpers
// ==============================================================================

// === Config & Types ===
/**
 * Drop-in `fetch` wrapper that translates OpenAI Responses API traffic
 * to an upstream API format (Anthropic Messages or OpenAI Chat).
 */

import * as anthropic from './translate/anthropic/index.js';
import * as openai from './translate/openai/index.js';
import { encodeSseEvent } from './utils/sse.js';
import type {
  ResponsesRequest,
  ResponsesStreamEvent,
  ResponsesResponse,
} from './types/responses.js';
import type { AnthropicResponse, AnthropicThinkingConfig } from './types/anthropic.js';
import type { OpenAiChatResponse } from './types/openai_chat.js';

export type UpstreamFormat = 'anthropic' | 'openai-chat';

export interface CacheStats {
  cachedTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CreateResponsesFetchOptions {
  /** Upstream API format. If omitted, inferred from `baseUrl`. */
  upstreamFormat?: UpstreamFormat;
  /** Upstream endpoint URL. Required. */
  baseUrl: string;
  /** Override upstream API version header (Anthropic only). */
  apiVersion?: string;
  /** Replace the caller-provided `model` field before translation. */
  model?: string;
  /** Extra headers merged into every upstream call. */
  defaultHeaders?: Record<string, string>;
  /** Underlying fetch. Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Non-/responses traffic forward target. Defaults to `options.fetch`. */
  passthroughFetch?: typeof fetch;
  /** Drop image/file parts from user messages (e.g. DeepSeek text-only models). */
  dropImages?: boolean;
  /** Optional callback to receive cache statistics. */
  onCacheStats?: (stats: CacheStats) => void;
  /** Override reasoning_effort sent to the upstream model (OpenAI Chat / Anthropic). */
  // ==============================================================================
  // Request Building
  // ==============================================================================

  reasoning_effort?: string;
  /** Override thinking configuration sent to the upstream model. */
  thinking?: unknown;
  /** Timeout in milliseconds for upstream requests. Defaults to no timeout. */
  timeoutMs?: number;
  /** Fallback upstream for requests where the last user message contains images. */
  fallbackUpstream?: {
    baseUrl: string;
    upstreamFormat?: UpstreamFormat;
    model?: string;
    defaultHeaders?: Record<string, string>;
    apiVersion?: string;
    reasoning_effort?: string;
    thinking?: unknown;
  };
}

export function createResponsesFetch(options: CreateResponsesFetchOptions): typeof fetch {
  if (!options.baseUrl) {
    throw new Error('baseUrl is required');
  }

  const rawFormat = options.upstreamFormat;
  const format = rawFormat
    ? normalizeFormat(rawFormat)
    : (inferFormatFromUrl(options.baseUrl) ?? 'openai-chat');
  if (!format) {
    throw new Error(
      `Unsupported upstream format: ${options.upstreamFormat}. Use 'anthropic' or 'openai-chat'`,
    );
  }

  const baseFetch = options.fetch ?? globalThis.fetch;
  if (!baseFetch) {
    throw new Error('fetch is not available; pass options.fetch');
  }
  const passthrough = options.passthroughFetch ?? baseFetch;

  return async (input, init) => {
    const url = urlOf(input);
    if (!isResponsesEndpoint(url)) {
      return passthrough(input, init);
    }

    const { body, signal, method, headers } = await extractRequest(input, init);
    if (method !== 'POST') {
      return passthrough(input, init);
    }

    let parsed: ResponsesRequest | undefined;
    // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
    try {
      parsed = body ? JSON.parse(body) : undefined;
    } catch {
      return jsonErrorResponse(400, 'Invalid JSON body for /responses');
    }
    if (!parsed) {
      return jsonErrorResponse(400, 'Missing body for /responses');
    }

    if (options.model) {
      parsed.model = options.model;
    }
    return handleResponses(parsed, format, options, baseFetch, headers, signal, options.dropImages);
  };
}

// ── format helpers ──

function normalizeBaseUrl(url: string, format: UpstreamFormat): string {
  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.replace(/\/+$/, '');
    if (format === 'anthropic') {
      if (path.endsWith('/v1/messages') || path.endsWith('/messages')) {
        return parsedUrl.toString();
      }
      if (path.endsWith('/v1')) {
        parsedUrl.pathname += '/messages';
        return parsedUrl.toString();
      }
      parsedUrl.pathname = '/v1/messages';
    } else {
      if (path.endsWith('/v1/chat/completions') || path.endsWith('/chat/completions')) {
        return parsedUrl.toString();
      }
      if (path.endsWith('/v1')) {
        parsedUrl.pathname += '/chat/completions';
        return parsedUrl.toString();
      }
      parsedUrl.pathname = '/v1/chat/completions';
    }
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function normalizeFormat(format: string): UpstreamFormat | null {
  const fmt: UpstreamFormat | null =
    format === 'anthropic' || format === 'openai-chat' ? format : null;
  return fmt;
}

function inferFormatFromUrl(baseUrl: string): UpstreamFormat | null {
  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    const parsedUrl = new URL(baseUrl);
    const path = parsedUrl.pathname.replace(/\/+$/, '');
    if (/\/messages$/.test(path) || parsedUrl.hostname.toLowerCase().includes('anthropic')) {
      return 'anthropic';
    }
    if (/\/chat\/completions$/.test(path)) {
      return 'openai-chat';
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ── request extraction ──

function isResponsesEndpoint(url: string): boolean {
  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    return /\/v1\/responses\/?$/.test(new URL(url, 'http://_internal_').pathname);
  } catch {
    return /\/v1\/responses(?:\?|$)/.test(url);
  }
}
// ==============================================================================
// Main Fetch Function
// ==============================================================================

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function parseHeaders(raw: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) {
    return out;
  }
  if (typeof Headers !== 'undefined' && raw instanceof Headers) {
    raw.forEach((val, key) => {
      out[key.toLowerCase()] = val;
    });
    return out;
  }
  if (Array.isArray(raw)) {
    for (const [k, v] of raw) {
      out[String(k).toLowerCase()] = String(v);
    }
    return out;
  }
  for (const [k, v] of Object.entries(raw)) {
    out[k.toLowerCase()] = String(v);
  }
  return out;
}

async function extractRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{
  body: string | undefined;
  signal: AbortSignal | undefined;
  method: string;
  headers: Record<string, string>;
}> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const text = await input.clone().text();
    const headers: HeadersInit = parseHeaders(input.headers);
    return { body: text || undefined, signal: input.signal, method: input.method, headers };
  }
  const method = init?.method?.toUpperCase() ?? 'GET';
  const body =
    init?.body != null
      ? typeof init.body === 'string'
        ? init.body
        : await readBody(init.body)
      : undefined;
  return { body, signal: init?.signal, method, headers: parseHeaders(init?.headers) };
}

async function readBody(body: BodyInit): Promise<string> {
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  return String(body);
}

// ── main handler ──

async function handleResponses(
  request: ResponsesRequest,
  format: UpstreamFormat,
  options: CreateResponsesFetchOptions,
  baseFetch: typeof fetch,
  incomingHeaders: Record<string, string>,
  // ==============================================================================
  // HTTP Client
  // ==============================================================================

  signal: AbortSignal | undefined,
  dropImages?: boolean,
): Promise<Response> {
  // Auto-fallback: if this upstream drops images but the last user message has them,
  // transparently switch to the fallback upstream.
  if (dropImages && options.fallbackUpstream && lastUserMessageHasImage(request)) {
    dropImages = false;
    const fb = options.fallbackUpstream;
    options = { ...options, ...fb, fallbackUpstream: undefined };
    format = fb.upstreamFormat ?? format;
    if (options.model) {
      request.model = options.model;
    }
    const fbModel = fb.model ? `, model: ${fb.model}` : '';
    console.warn(`[fallback] last user message has image, routing to ${fb.baseUrl}${fbModel}`);
  }

  const streaming = request.stream ?? false;
  const resolvedUrl = normalizeBaseUrl(options.baseUrl, format);
  const { upstreamBody, requestMetadata } = buildUpstreamBody(
    request,
    format,
    streaming,
    options.baseUrl,
    dropImages,
    options.reasoning_effort,
    options.thinking,
  );
  const upstreamHeaders = buildUpstreamHeaders(format, options, incomingHeaders);

  const upstream = await baseFetch(resolvedUrl, {
    method: 'POST',
    headers: upstreamHeaders,
    body: JSON.stringify(upstreamBody),
    signal,
  });

  if (!upstream.ok) {
    return new Response(await upstream.text().catch(() => ''), {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!streaming) {
    const body = await upstream.json();
    const translated =
      format === 'anthropic'
        ? // eslint-disable-next-line no-restricted-syntax -- union type narrowing requires type assertion
          anthropic.translateResponse(body as AnthropicResponse, { model: request.model })
        : // eslint-disable-next-line no-restricted-syntax -- union type narrowing requires type assertion
          openai.translateResponse(body as OpenAiChatResponse, { model: request.model });
    options.onCacheStats?.(extractCacheStatsFromResponse(translated));
    return new Response(JSON.stringify(translated), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!upstream.body) {
    return jsonErrorResponse(502, 'Upstream streaming response has no body');
  }

  const events =
    format === 'anthropic'
      ? anthropic.translateStream(upstream.body, { model: request.model, requestMetadata })
      : openai.translateStream(upstream.body, { model: request.model, requestMetadata });

  return new Response(
    responsesEventsToSseStream(collectCacheStatsFromStream(events, options.onCacheStats)),
    {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    },
  );
}

// ── upstream body ──

function buildRequestMetadata(request: ResponsesRequest, temperature?: number, top_p?: number) {
  return {
    temperature,
    top_p,
    tools: request.tools ?? [],
    tool_choice: request.tool_choice,
    store: request.store ?? true,
    metadata: request.metadata ?? {},
  };
}

function buildUpstreamBody(
  request: ResponsesRequest,
  format: UpstreamFormat,
  streaming: boolean,
  baseUrl: string,
  dropImages?: boolean,
  reasoning_effort?: string,
  thinking?: unknown,
): { upstreamBody: unknown; requestMetadata: ReturnType<typeof buildRequestMetadata> } {
  if (format === 'anthropic') {
    const { request: ar } = anthropic.translateRequest(request);
    ar.stream = streaming;
    if (thinking !== undefined) {
      // eslint-disable-next-line no-restricted-syntax -- thinking comes from config.json, runtime-checked
      ar.thinking = thinking as AnthropicThinkingConfig;
    } else if (reasoning_effort) {
      const effort = reasoning_effort.toLowerCase();
      if (effort === 'minimal') {
        ar.thinking = { type: 'disabled' };
      } else if (effort === 'low') {
        ar.thinking = { type: 'enabled', budget_tokens: 4096 };
      } else if (effort === 'medium') {
        ar.thinking = { type: 'enabled', budget_tokens: 16384 };
      } else if (effort === 'high') {
        ar.thinking = { type: 'enabled', budget_tokens: 32768 };
      } else if (effort === 'xhigh') {
        ar.thinking = { type: 'enabled', budget_tokens: 65536 };
      }
    }
    return {
      upstreamBody: ar,
      requestMetadata: buildRequestMetadata(request, ar.temperature, ar.top_p),
    };
  }
  const { request: cr } = openai.translateRequest(request, { dropImages: dropImages });
  cr.stream = streaming;
  if (streaming) {
    cr.stream_options = { include_usage: true };
  }
  if (reasoning_effort !== undefined) {
    cr.reasoning_effort = reasoning_effort;
  }
  if (thinking !== undefined) {
    cr.thinking = thinking;
  }
  return {
    upstreamBody: cr,
    requestMetadata: buildRequestMetadata(request, cr.temperature, cr.top_p),
  };
}

// ── upstream headers ──

function buildUpstreamHeaders(
  format: UpstreamFormat,
  options: CreateResponsesFetchOptions,
  incoming: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (DROPPED_HEADERS.has(key) || isClientSpecificHeader(key)) {
      continue;
    }
    out[key] = value;
  }
  if (options.defaultHeaders) {
    for (const [k, v] of Object.entries(options.defaultHeaders)) {
      out[k.toLowerCase()] = v;
    }
  }
  out['content-type'] = 'application/json';
  if (format === 'anthropic') {
    if (!out['anthropic-version']) {
      out['anthropic-version'] = options.apiVersion ?? '2023-06-01';
    }
    if (typeof out['authorization'] === 'string') {
      const match = /^Bearer\s+(.+)$/i.exec(out['authorization']);
      if (match) {
        out['x-api-key'] = match[1].trim();
      }
    }
    delete out['authorization'];
  }
  return out;
}

const DROPPED_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'accept-encoding',
  'accept',
  'user-agent',
]);

function isClientSpecificHeader(key: string): boolean {
  const keyLower = key.toLowerCase();
  return (
    keyLower.startsWith('openai-') ||
    keyLower.startsWith('x-stainless') ||
    keyLower.startsWith('x-codex-') ||
    keyLower === 'originator' ||
    keyLower === 'session_id' ||
    keyLower === 'x-client-request-id'
  );
}

// ── SSE stream ──

function responsesEventsToSseStream(
  events: AsyncGenerator<ResponsesStreamEvent, void, void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
      try {
        const { value, done } = await events.next();
        if (done) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(encodeSseEvent(value && value.type, value)));
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
      try {
        await events.return?.();
      } catch {
        /* noop */
      }
    },
  });
}

// ── cache stats ──

function extractCacheStatsFromResponse(response: ResponsesResponse): CacheStats {
  const usage = response.usage;
  return {
    cachedTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheCreationTokens: usage?.input_tokens_details?.cache_creation_tokens ?? 0,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

async function* collectCacheStatsFromStream(
  events: AsyncGenerator<ResponsesStreamEvent, void, void>,
  onCacheStats?: (stats: CacheStats) => void,
): AsyncGenerator<ResponsesStreamEvent, void, void> {
  let lastStats: CacheStats | undefined;
  for await (const event of events) {
    if (event.type === 'response.completed') {
      // eslint-disable-next-line no-restricted-syntax -- upstream event carries runtime property not in type
      const eventResp = event as unknown as { response?: ResponsesResponse };
      const resp = eventResp.response;
      if (resp?.usage) {
        lastStats = extractCacheStatsFromResponse(resp);
      }
    }
    yield event;
  }
  if (lastStats && onCacheStats) {
    onCacheStats(lastStats);
  }
}

/**
 * Check if the last user message in the input contains image content.
 * Assistant messages and tool results are skipped — only the most recent
 * `role: 'user'` item is inspected.
 */
function lastUserMessageHasImage(request: ResponsesRequest): boolean {
  const input = request.input;
  if (!input || !Array.isArray(input)) {
    return false;
  }
  for (let i = input.length - 1; i >= 0; i--) {
    const item = input[i];
    if (!item || typeof item !== 'object') {
      continue;
    }
    const itemRecord: Record<string, unknown> = item;
    if (itemRecord.role !== 'user') {
      continue;
    }
    // Found the last user message
    const content = itemRecord.content;
    if (!Array.isArray(content)) {
      return false;
    }
    for (const part of content) {
      if (part && typeof part === 'object') {
        const partItem: Record<string, unknown> = part;
        const type = partItem.type;
        if (type === 'input_image' || type === 'image' || type === 'image_url') {
          return true;
        }
      }
    }
    return false;
  }
  return false;
}

// ── error helpers ──

function jsonErrorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: { message, type: 'upstream_error', code: String(status) } }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}
