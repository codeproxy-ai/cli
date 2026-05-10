import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CLI fallback missing upstream', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-fallback-missing-' + Date.now());

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

  it('warns when fallback upstream is not found', async () => {
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
    // fallback not found — should warn and not set fallbackUpstream
    expect(opts.fallbackUpstream).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      'Warning: fallback upstream "nonexistent" not found in config',
    );
  });
});
