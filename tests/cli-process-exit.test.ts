import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';

describe('CLI process.exit paths', () => {
  beforeAll(() => {
    // eslint-disable-next-line no-restricted-syntax
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('loadConfigFile throws on missing file', async () => {
    const { loadConfigFile } = await import('../src/server/cli.js');
    await expect(loadConfigFile('/nonexistent/path/config.json')).rejects.toThrow(
      'process.exit(1)',
    );
  });

  it('loadConfigFile throws on invalid JSON', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const tmpDir = join(tmpdir(), 'codeproxy-exit-test-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'bad.json');
    writeFileSync(configPath, 'not-json');

    const { loadConfigFile } = await import('../src/server/cli.js');
    await expect(loadConfigFile(configPath)).rejects.toThrow('process.exit(1)');
  });

  it('loadConfigAndApplyOverrides exits on invalid upstream name', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const tmpDir = join(tmpdir(), 'codeproxy-exit-test2-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'missing',
        upstreams: { other: { baseUrl: 'https://test.com' } },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    await expect(loadConfigAndApplyOverrides(configPath, {})).rejects.toThrow('process.exit(');
    expect(console.error).toHaveBeenCalledWith(
      'Invalid config file: currentUpstream "missing" not found in upstreams',
    );
  });

  it('loadConfigAndApplyOverrides exits on config validation failure (no upstreams)', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const tmpDir = join(tmpdir(), 'codeproxy-exit-test3-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    // Missing upstreams object entirely
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'test',
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    await expect(loadConfigAndApplyOverrides(configPath, {})).rejects.toThrow('process.exit(');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid config file'));
  });
});
