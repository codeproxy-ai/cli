import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CLI headers edge cases', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-headers-edge-' + Date.now());

  beforeAll(() => {
    // eslint-disable-next-line no-restricted-syntax
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('handles config with apiKey and upstream headers (overrides)', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'deepseek',
        headers: { 'x-global': 'global-val' },
        upstreams: {
          deepseek: {
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: 'sk-key',
            headers: { 'x-upstream': 'upstream-val' },
            model: 'deepseek-v4',
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});

    // Should merge root + upstream headers + apiKey
    expect(opts.defaultHeaders).toBeDefined();
    expect(opts.defaultHeaders!['x-global']).toBe('global-val');
    expect(opts.defaultHeaders!['x-upstream']).toBe('upstream-val');
    expect(opts.defaultHeaders!.authorization).toBe('Bearer sk-key');
    expect(opts.model).toBe('deepseek-v4');
  });

  it('handles config with apiKey and override apikey', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'deepseek',
        upstreams: {
          deepseek: {
            baseUrl: 'https://api.deepseek.com/v1',
            apiKey: 'sk-original',
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, { apikey: 'sk-override' });
    // CLI override should take precedence
    expect(opts.defaultHeaders?.authorization).toBe('Bearer sk-override');
  });

  it('handles fallback not found (missing upstream)', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'deepseek',
        upstreams: {
          deepseek: {
            baseUrl: 'https://api.deepseek.com/v1',
            fallback: 'nonexistent',
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.fallbackUpstream).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: fallback upstream "nonexistent" not found in config',
    );
  });
});
