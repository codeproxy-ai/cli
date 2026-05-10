import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CLI port configuration', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-port-test-' + Date.now());

  beforeAll(() => {
    // eslint-disable-next-line no-restricted-syntax
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('uses top-level config port', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'test',
        port: 9999,
        upstreams: {
          test: { baseUrl: 'https://api.test.com/v1' },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.port).toBe(9999);
  });

  it('uses upstream port', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'test',
        upstreams: {
          test: { baseUrl: 'https://api.test.com/v1', port: 8888 },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.port).toBe(8888);
  });

  it('uses override port from CLI args', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'test',
        upstreams: {
          test: { baseUrl: 'https://api.test.com/v1' },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, { port: 7777 });
    expect(opts.port).toBe(7777);
  });
});
