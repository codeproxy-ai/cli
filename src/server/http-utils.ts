import type { IncomingMessage } from 'node:http';

export function flattenIncomingHeaders(
  headers: IncomingMessage['headers'],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) {
      continue;
    }
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

export function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers':
      'authorization,content-type,x-api-key,anthropic-version,anthropic-beta,anthropic-dangerous-direct-browser-access',
    'access-control-expose-headers': 'content-type',
  };
}

export function tryParseJson(str: string | undefined | null): unknown {
  if (!str) {
    return str ?? null;
  }
  // eslint-disable-next-line no-restricted-syntax -- try/catch needed for server-side HTTP error handling
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

export function headersInitToObject(headersInit: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headersInit) {
    return out;
  }
  if (typeof Headers !== 'undefined' && headersInit instanceof Headers) {
    headersInit.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  if (Array.isArray(headersInit)) {
    for (const [key, value] of headersInit) {
      out[String(key).toLowerCase()] = String(value);
    }
    return out;
  }
  for (const [key, value] of Object.entries(headersInit)) {
    out[key.toLowerCase()] = String(value);
  }
  return out;
}

export function redactAuth(headers: Record<string, string> | undefined): void {
  if (!headers) {
    return;
  }
  for (const key of Object.keys(headers)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === 'authorization' ||
      lowerKey === 'x-api-key' ||
      lowerKey === 'api-key' ||
      lowerKey === 'cookie'
    ) {
      headers[key] = '[REDACTED]';
    }
  }
}
