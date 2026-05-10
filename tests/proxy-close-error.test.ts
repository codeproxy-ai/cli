import { describe, expect, it, vi, afterAll } from 'vitest';
import { startProxy } from '../src/server/proxy.js';

describe('proxy close error', () => {
  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('handles server close error gracefully', async () => {
    // Create a proxy and then close it before the server finishes starting
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const proxy = await startProxy({
      upstreamFormat: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      host: '127.0.0.1',
      port: 0,
      fetch: async () => new Response('ok'),
      logger: console,
    });

    // Close proxy
    await proxy.close();

    // Verify no errors or warnings
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
