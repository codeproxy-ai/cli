import { afterAll, describe, expect, it } from 'vitest';
import { startProxy } from '../src/server/proxy.js';
import { existsSync, rmSync } from 'node:fs';

describe('proxy remaining edge cases', () => {
  const logsDir = '/tmp/codeproxy-deep-test-' + Date.now();

  afterAll(() => {
    if (existsSync(logsDir)) {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('generates error dump with logger on upstream 500', async () => {
    const errorUpstream: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: 'fail' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    };

    const logs: string[] = [];
    const testLogger = {
      log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => logs.push('WARN: ' + args.map(String).join(' ')),
      error: (...args: unknown[]) => logs.push('ERROR: ' + args.map(String).join(' ')),
    };

    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: errorUpstream,
      logger: testLogger,
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
    expect(logs.some((msg) => msg.includes('proxy-failure'))).toBe(true);
    await proxy.close();
  });

  it('handles upstream fetch error through catch block', async () => {
    const badUpstream: typeof fetch = async () => {
      throw new Error('upstream failure');
    };

    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: badUpstream,
      logger: null,
    });

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'test', input: 'Hello' }),
    });

    expect(res.status).toBe(500);
    await proxy.close();
  });
});
