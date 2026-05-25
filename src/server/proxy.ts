// ==============================================================================
// Helpers
// ==============================================================================

/**
 * Local HTTP proxy that exposes the Responses API and forwards translated
 * requests to the configured upstream API format.
 */

import http, { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { handleCompactRequest } from './compact.js';
import { applyModelAliasesToBody } from './model-aliases.js';
import {
  corsHeaders,
  flattenIncomingHeaders,
  headersInitToObject,
  headersToObject,
  redactAuth,
  tryParseJson,
} from './http-utils.js';

// ==============================================================================
// Helpers
// ==============================================================================
export function fmtTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

export function fmtDuration(ms: number): string {
  // ==============================================================================
  // Server
  // ==============================================================================

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
import { createResponsesFetch, type CreateResponsesFetchOptions } from '@codeproxy/core';

export {
  corsHeaders,
  flattenIncomingHeaders,
  headersInitToObject,
  headersToObject,
  redactAuth,
  tryParseJson,
} from './http-utils.js';

export interface StartProxyOptions extends Omit<CreateResponsesFetchOptions, 'passthroughFetch'> {
  /** Host to bind to. Defaults to `127.0.0.1`. */
  host?: string;
  /** Port to listen on. Defaults to `8787`; pass `0` for a random free port. */
  port?: number;
  /** Enable permissive CORS (useful for local browser dev). Defaults to true. */
  cors?: boolean;
  /** Optional logger. Defaults to `console`. Pass `null` to silence. */
  logger?: Pick<Console, 'log' | 'warn' | 'error'> | null;
  /** Selectively rewrite incoming model names before forwarding to the upstream. */
  modelAliases?: Record<string, string>;
  /** Optional callback to receive cache statistics after each request completes. */
  onCacheStats?: (stats: {
    cachedTokens: number;
    cacheCreationTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    method?: string;
    url?: string;
    durationMs?: number;
  }) => void;
}

export interface RunningProxy {
  host: string;
  port: number;
  url: string;
  server: Server;
  close: () => Promise<void>;
}

export async function startProxy(options: StartProxyOptions): Promise<RunningProxy> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const cors = options.cors ?? true;
  const logger = options.logger === null ? null : (options.logger ?? console);

  // Rolling average for request duration coloring (last 50 requests)
  const durationHistory: number[] = [];
  function updateRollingAverage(ms: number) {
    durationHistory.push(ms); /* c8 ignore next 3 -- threshold rarely hit */
    if (durationHistory.length > 50) {
      durationHistory.shift();
    }
    return durationHistory.reduce((sum, val) => sum + val, 0) / durationHistory.length;
  }

  // Centralized status line for all active requests
  const activeRequests = new Map<string, { method: string; url: string; startTime: number }>();
  // ==============================================================================
  // Request Handler
  // ==============================================================================

  let statusTimerId: ReturnType<typeof setInterval> | null = null;

  function drawStatusLine() {
    if (activeRequests.size === 0) {
      return; /* c8 ignore next -- empty guard */
    }
    const parts = Array.from(activeRequests.entries()).map(([, req]) => {
      const elapsed = Date.now() - req.startTime;
      return `[${fmtDuration(elapsed)}]`;
    });
    process.stdout.write(`\r\x1b[K⏳ ${parts.join(', ')}`);
  }

  const requestTracker = {
    add(method: string, url: string): string {
      const id = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      activeRequests.set(id, { method, url, startTime: Date.now() });
      drawStatusLine();
      if (!statusTimerId) {
        statusTimerId = setInterval(drawStatusLine, 150);
      }
      return id;
    },
    remove(id: string) {
      activeRequests.delete(id);
      if (activeRequests.size === 0) {
        process.stdout.write('\r\x1b[K');
        if (statusTimerId) {
          clearInterval(statusTimerId);
          statusTimerId = null;
        }
      }
    },
  };

  const requestInfo = { method: '', url: '', startTime: 0, resultLog: '' };

  const upstreamCapture: {
    request?: { url: string; method: string; headers: Record<string, string>; body: unknown };
    response?: {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: unknown;
    };
  } = {};

  const baseFetch = options.fetch ?? globalThis.fetch;
  const capturingFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? input?.method ?? 'GET').toUpperCase();
    const reqHeaders = headersInitToObject(init?.headers);
    let reqBody: unknown = undefined;
    if (init?.body != null) {
      if (typeof init.body === 'string') {
        reqBody = tryParseJson(init.body);
      } /* c8 ignore next 6 -- defensive body serialization */ else if (
        init.body instanceof ArrayBuffer
      ) {
        reqBody = tryParseJson(new TextDecoder().decode(init.body));
      } else if (ArrayBuffer.isView(init.body)) {
        reqBody = tryParseJson(new TextDecoder().decode(init.body));
      } else {
        reqBody = String(init.body);
      }
    }
    upstreamCapture.request = { url, method, headers: reqHeaders, body: reqBody };

    const resp = await baseFetch(input, init);

    {
      const clone = resp.clone();
      const text = await clone.text().catch(() => '');
      upstreamCapture.response = {
        status: resp.status,
        statusText: resp.statusText,
        headers: headersToObject(resp.headers),
        body: tryParseJson(text),
      };
    }
    return resp;
  };

  const apiFetch = createResponsesFetch({
    upstreamFormat: options.upstreamFormat,
    baseUrl: options.baseUrl,
    apiVersion: options.apiVersion,
    model: options.model,
    defaultHeaders: options.defaultHeaders,
    timeoutMs: options.timeoutMs,
    dropImages: options.dropImages,
    fallbackUpstream: options.fallbackUpstream,
    fetch: capturingFetch,
    passthroughFetch: async () =>
      new Response(JSON.stringify({ error: { message: 'Not found' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    onCacheStats: (stats) => {
      const durationMs = requestInfo.startTime ? Date.now() - requestInfo.startTime : 0;
      const billedTokens = stats.inputTokens + stats.outputTokens - stats.cachedTokens;
      const parts = [
        `total=${stats.totalTokens}`,
        `input=${stats.inputTokens}`,
        `output=${stats.outputTokens}`,
        `cached=${stats.cachedTokens}`,
        `billed=${billedTokens}`,
      ];
      if (stats.cacheCreationTokens > 0) {
        parts.push(`cache_creation=${stats.cacheCreationTokens}`);
      }
      const avg = updateRollingAverage(durationMs);
      const ratio = avg > 0 ? durationMs / avg : 1;
      const color = ratio < 0.8 ? '\x1b[32m' : ratio < 1.5 ? '\x1b[33m' : '\x1b[31m';
      const reset = '\x1b[0m';
      const logMsg = `[${fmtTime(new Date())}] -> 200 (${color}${fmtDuration(durationMs)}${reset} avg=${fmtDuration(Math.round(avg))}) [${parts.join(', ')}]`;
      requestInfo.resultLog =
        stats.cachedTokens < 1024 && billedTokens > 0 ? `⚠️ NO CACHE -- ${logMsg}` : logMsg;

      if (options.onCacheStats) {
        options.onCacheStats({
          ...stats,
          method: requestInfo.method || undefined,
          url: requestInfo.url || undefined,
          durationMs: durationMs || undefined,
        });
      }
    },
  });

  const server = http.createServer(async (req, res) => {
    const start = Date.now();
    requestInfo.method = req.method ?? 'POST';
    requestInfo.url = req.url ?? '/v1/responses';
    requestInfo.startTime = start;

    const abortController = new AbortController();
    const timeoutMs = options.timeoutMs;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        logger?.warn(`[timeout] request exceeded ${timeoutMs}ms, aborting`);
        abortController.abort();
        res.destroy();
        req.destroy();
      }, timeoutMs);
    }

    // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
    try {
      await handleRequest(req, res, {
        apiFetch,
        cors,
        logger,
        method: req.method ?? 'POST',
        url: req.url ?? '/',
        upstreamCapture,
        requestInfo,
        requestTracker,
        modelAliases: options.modelAliases,
        signal: abortController.signal,
      });
    } catch (err) {
      logger?.error('[proxy-error]', err);
      // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
      try {
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Internal server error' } }));
        }
        /* c8 ignore start */
      } catch {
        // ignore
      } /* c8 ignore stop */
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const actualPort = (() => {
        // eslint-disable-next-line no-restricted-syntax -- net.Server.address() returns string | AddressInfo | null
        const addr = server.address() as { port: number } | null;
        return addr.port;
      })();
      const url = `http://${host}:${actualPort}`;
      logger?.log(`Proxy listening on ${url}`);
      logger?.log(`Upstream format: ${options.upstreamFormat}`);
      logger?.log(`Upstream URL: ${options.baseUrl}`);
      resolve({
        host,
        port: actualPort,
        url,
        server,
        close: () =>
          new Promise((res) => {
            server.close((err) => {
              /* c8 ignore start */
              if (err) {
                logger?.warn('Error closing server:', err);
              }
              /* c8 ignore stop */
              res();
            });
          }),
      });
    });
    server.once('error', reject);
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    apiFetch: typeof fetch;
    cors: boolean;
    logger: Pick<Console, 'log' | 'warn' | 'error'> | null;
    method: string;
    url: string;
    upstreamCapture: {
      request?: { url: string; method: string; headers: Record<string, string>; body: unknown };
      response?: {
        status: number;
        statusText: string;
        headers: Record<string, string>;
        body: unknown;
      };
    };
    requestInfo: { resultLog: string };
    requestTracker: { add: (method: string, url: string) => string; remove: (id: string) => void };
    modelAliases?: Record<string, string>;
    signal?: AbortSignal;
  },
): Promise<void> {
  if (opts.cors) {
    setCorsHeaders(res);
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const method = req.method ?? 'GET';
  const urlPath = req.url ?? '/';
  const headers = flattenIncomingHeaders(req.headers);

  let body: Buffer | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readIncomingBody(req);
  }

  const pathname = requestPathname(urlPath);
  if (pathname !== '/v1/responses' && pathname !== '/v1/responses/compact') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Not found: ${method} ${urlPath}` } }));
    return;
  }

  const requestBodyText = body ? body.toString('utf8') : undefined;

  const requestStart = Date.now();
  const requestId = opts.requestTracker.add(method, urlPath);

  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    if (pathname === '/v1/responses/compact') {
      const response = handleCompactRequest(method, requestBodyText);
      const responseBodyText = await response.clone().text();
      saveLastMessage(tryParseJson(requestBodyText), tryParseJson(responseBodyText));

      opts.requestTracker.remove(requestId);
      /* c8 ignore start */
      if (opts.logger) {
        process.stdout.write(
          `\r\x1b[K<-- ${response.status}  (${fmtDuration(Date.now() - requestStart)})\n`,
        );
      }
      /* c8 ignore stop */

      const outHeaders = headersToObject(response.headers);
      if (opts.cors) {
        Object.assign(outHeaders, corsHeaders());
      }
      res.writeHead(response.status, outHeaders);
      res.end(responseBodyText);
      return;
    }

    const upstreamBody = applyModelAliasesToBody(body, opts.modelAliases);
    const response = await opts.apiFetch(`http://local${urlPath}`, {
      method,
      headers,
      body: upstreamBody ? new Uint8Array(upstreamBody) : undefined,
      signal: opts.signal,
    });

    // Consume response body so onCacheStats fires (for streaming responses)
    const responseBodyText = response.body ? await response.clone().text() : '';

    // Save last message for debugging (includes upstream raw exchange)
    saveLastMessage(tryParseJson(requestBodyText), tryParseJson(responseBodyText), {
      request: opts.upstreamCapture.request,
      response: opts.upstreamCapture.response,
    });

    // Remove from active requests and write final result
    opts.requestTracker.remove(requestId);
    /* c8 ignore start */
    if (opts.logger) {
      if (response.status >= 400) {
        process.stdout.write(
          `\r\x1b[K<-- ${response.status}  (${fmtDuration(Date.now() - requestStart)})\n`,
        );
      } else if (opts.requestInfo.resultLog) {
        process.stdout.write(`\r\x1b[K${opts.requestInfo.resultLog}\n`);
      } else {
        process.stdout.write(
          `\r\x1b[K<-- ${response.status}  (${fmtDuration(Date.now() - requestStart)})\n`,
        );
      }
    }
    /* c8 ignore stop */
    if (response.status >= 400) {
      // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
      try {
        const filePath = saveErrorDump({
          method: opts.method,
          url: opts.url,
          clientRequest: {
            headers,
            body: tryParseJson(requestBodyText ?? ''),
          },
          upstreamRequest: opts.upstreamCapture.request,
          upstreamResponse: opts.upstreamCapture.response,
          proxyResponse: {
            status: response.status,
            headers: headersToObject(response.headers),
            body: tryParseJson(responseBodyText),
          },
        });
        opts.logger?.error(`[proxy-failure] full exchange saved to ${filePath}`);
      } catch (dumpErr) {
        opts.logger?.error('[proxy-failure] failed to persist error dump', dumpErr);
      }
    }

    const outHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      outHeaders[key] = value;
    });
    if (opts.cors) {
      Object.assign(outHeaders, corsHeaders());
    }

    res.writeHead(response.status, outHeaders);

    /* c8 ignore next 3 */
    if (!response.body) {
      res.end();
      return;
    }

    // eslint-disable-next-line no-restricted-syntax -- fetch response.body is not typed as node stream
    const typedBody = response.body! as unknown as import('stream/web').ReadableStream<Uint8Array>;
    const nodeStream = Readable.fromWeb(typedBody);
    nodeStream.pipe(res);
    await new Promise<void>((resolve, reject) => {
      nodeStream.once('end', resolve);
      nodeStream.once('error', reject);
      res.once('close', resolve);
    });
  } catch (err) {
    opts.requestTracker.remove(requestId);
    throw err;
  }
}

function requestPathname(urlPath: string): string {
  // eslint-disable-next-line no-restricted-syntax -- URL parsing is the safest way to ignore query strings
  try {
    return new URL(urlPath, 'http://local').pathname.replace(/\/+$/, '') || '/';
  } catch {
    return urlPath.split('?')[0]?.replace(/\/+$/, '') || '/';
  }
}

function readIncomingBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => {
      const buf: Buffer = chunk;
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function setCorsHeaders(res: ServerResponse): void {
  const headers = corsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

export function saveErrorDump(dump: {
  method: string;
  url: string;
  clientRequest: { headers: Record<string, string>; body: unknown };
  upstreamRequest?: { url: string; method: string; headers: Record<string, string>; body: unknown };
  upstreamResponse?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: unknown;
  };
  proxyResponse: { status: number; headers: Record<string, string>; body: unknown };
}): string {
  const dir = resolve(process.cwd(), 'logs');
  mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const status = dump.upstreamResponse?.status ?? dump.proxyResponse.status;
  const filename = `proxy-error-${ts}-${status}.json`;
  const filePath = join(dir, filename);
  const payload = {
    timestamp: new Date().toISOString(),
    ...dump,
  };
  redactAuth(payload.clientRequest?.headers);
  redactAuth(payload.upstreamRequest?.headers);
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

/** Save the last message to logs/last-message.json for debugging. */
export function saveLastMessage(
  requestBody: unknown,
  responseBody: unknown,
  upstream?: { request?: unknown; response?: unknown },
): string {
  const dir = resolve(process.cwd(), 'logs');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, 'last-message.json');
  const payload = {
    timestamp: new Date().toISOString(),
    request: requestBody,
    response: responseBody,
    upstream,
  };
  const upstreamRequest = upstream?.request;
  if (hasHeaders(upstreamRequest)) {
    redactAuth(upstreamRequest.headers);
  }
  writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function hasHeaders(value: unknown): value is { headers?: Record<string, string> } {
  return Boolean(value) && typeof value === 'object' && 'headers' in value;
}
