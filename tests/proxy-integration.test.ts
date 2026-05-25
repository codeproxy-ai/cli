import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startProxy, saveErrorDump, fmtTime } from '../src/server/proxy.js';
import { existsSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('startProxy integration', () => {
  it('handles GET request with 404', async () => {
    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: async () => new Response('ok'),
      logger: null,
    });

    const res = await fetch(`${proxy.url}/health`, { method: 'GET' });
    expect(res.status).toBe(404);
    await proxy.close();
  });

  it('handles OPTIONS without CORS headers by default', async () => {
    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: async () => new Response('ok'),
      logger: null,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    await proxy.close();
  });
});

describe('saveErrorDump', () => {
  const logsDir = join(tmpdir(), `codeproxy-save-error-dump-${Date.now()}`);
  const previousLogDir = process.env.CODEPROXY_LOG_DIR;

  beforeAll(() => {
    process.env.CODEPROXY_LOG_DIR = logsDir;
  });

  afterAll(() => {
    if (previousLogDir === undefined) {
      delete process.env.CODEPROXY_LOG_DIR;
    } else {
      process.env.CODEPROXY_LOG_DIR = previousLogDir;
    }
    if (existsSync(logsDir)) {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('writes error dump to logs directory', () => {
    const filePath = saveErrorDump({
      method: 'POST',
      url: '/v1/responses',
      clientRequest: { headers: { authorization: 'Bearer test' }, body: { input: 'hi' } },
      upstreamRequest: {
        url: 'https://api.example.com',
        method: 'POST',
        headers: { 'x-api-key': 'secret' },
        body: { input: 'hi' },
      },
      upstreamResponse: {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'application/json' },
        body: { error: 'fail' },
      },
      proxyResponse: {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: { error: 'fail' },
      },
    });

    expect(filePath).toContain('proxy-error-');
    expect(filePath).toContain('-500.json');
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.clientRequest.headers.authorization).toBe('[REDACTED]');
    expect(parsed.upstreamRequest.headers['x-api-key']).toBe('[REDACTED]');
  });

  it('handles missing upstreamResponse gracefully', () => {
    const filePath = saveErrorDump({
      method: 'GET',
      url: '/test',
      clientRequest: { headers: {}, body: null },
      proxyResponse: { status: 404, headers: {}, body: { error: 'not found' } },
    });

    expect(filePath).toContain('-404.json');
    expect(existsSync(filePath)).toBe(true);
  });

  it('handles missing clientRequest gracefully', () => {
    const filePath = saveErrorDump({
      method: 'POST',
      url: '/v1/responses',
      clientRequest: { headers: {}, body: null },
      upstreamResponse: {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/plain' },
        body: 'upstream error',
      },
      proxyResponse: {
        status: 502,
        headers: { 'content-type': 'text/plain' },
        body: 'upstream error',
      },
    });
    expect(filePath).toContain('-502.json');
    expect(existsSync(filePath)).toBe(true);
  });
});

describe('fmtTime', () => {
  it('formats a date as HH:MM:SS', () => {
    const date = new Date('2025-01-15T14:30:25');
    const result = fmtTime(date);
    expect(result).toBe('14:30:25');
  });

  it('pads single-digit hours', () => {
    const date = new Date('2025-01-15T09:05:03');
    const result = fmtTime(date);
    expect(result).toBe('09:05:03');
  });
});
