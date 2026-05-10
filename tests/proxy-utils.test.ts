import { describe, expect, it } from 'vitest';
import {
  fmtDuration,
  headersToObject,
  corsHeaders,
  tryParseJson,
  headersInitToObject,
  redactAuth,
} from '../src/server/proxy.js';

describe('fmtDuration', () => {
  it('formats milliseconds', () => {
    expect(fmtDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(fmtDuration(1500)).toBe('1.5s');
  });

  it('formats minutes and seconds', () => {
    expect(fmtDuration(125000)).toBe('2:05');
  });
});

describe('headersToObject', () => {
  it('converts Headers to Record', () => {
    const hdrs = new Headers({ 'content-type': 'application/json', authorization: 'Bearer x' });
    expect(headersToObject(hdrs)).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer x',
    });
  });
});

describe('corsHeaders', () => {
  it('returns CORS headers', () => {
    const corsHdrs = corsHeaders();
    expect(corsHdrs['access-control-allow-origin']).toBe('*');
    expect(corsHdrs['access-control-allow-methods']).toBe('GET,POST,OPTIONS');
    expect(corsHdrs['access-control-allow-headers']).toContain('authorization');
  });
});

describe('tryParseJson', () => {
  it('parses valid JSON', () => {
    expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns string for invalid JSON', () => {
    expect(tryParseJson('not-json')).toBe('not-json');
  });

  it('returns null for null input', () => {
    expect(tryParseJson(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(tryParseJson(undefined)).toBeNull();
  });

  it('returns empty string', () => {
    expect(tryParseJson('')).toBe('');
  });
});

describe('headersInitToObject', () => {
  it('returns empty object for undefined', () => {
    expect(headersInitToObject(undefined)).toEqual({});
  });

  it('converts Headers instance', () => {
    const hdrs = new Headers({ 'x-custom': 'val' });
    expect(headersInitToObject(hdrs)).toEqual({ 'x-custom': 'val' });
  });

  it('converts array of tuples', () => {
    const arr: [string, string][] = [
      ['x-key', 'val'],
      ['x-other', 'val2'],
    ];
    expect(headersInitToObject(arr)).toEqual({ 'x-key': 'val', 'x-other': 'val2' });
  });

  it('converts Record', () => {
    expect(headersInitToObject({ 'X-Mixed': 'Val' })).toEqual({ 'x-mixed': 'Val' });
  });

  it('skips null headersInit', () => {
    // eslint-disable-next-line no-restricted-syntax
    const result = headersInitToObject(null as unknown as HeadersInit);
    expect(result).toEqual({});
  });
});

describe('redactAuth', () => {
  it('redacts authorization header', () => {
    const hdrs: Record<string, string> = { authorization: 'Bearer secret', 'content-type': 'json' };
    redactAuth(hdrs);
    expect(hdrs.authorization).toBe('[REDACTED]');
    expect(hdrs['content-type']).toBe('json');
  });

  it('redacts x-api-key header', () => {
    const hdrs: Record<string, string> = { 'x-api-key': 'secret-key' };
    redactAuth(hdrs);
    expect(hdrs['x-api-key']).toBe('[REDACTED]');
  });

  it('redacts api-key header', () => {
    const hdrs: Record<string, string> = { 'api-key': 'secret' };
    redactAuth(hdrs);
    expect(hdrs['api-key']).toBe('[REDACTED]');
  });

  it('redacts cookie header', () => {
    const hdrs: Record<string, string> = { cookie: 'session=abc' };
    redactAuth(hdrs);
    expect(hdrs.cookie).toBe('[REDACTED]');
  });

  it('handles case-insensitive redaction', () => {
    const hdrs: Record<string, string> = { Authorization: 'Bearer token' };
    redactAuth(hdrs);
    expect(hdrs.Authorization).toBe('[REDACTED]');
  });

  it('does nothing for undefined headers', () => {
    expect(() => redactAuth(undefined)).not.toThrow();
  });
});
