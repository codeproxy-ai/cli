import { describe, expect, it, afterEach } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfigFile (utils)', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-utils-test-' + Date.now());

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loads config from search path with .json', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'codeproxy.config.json'),
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'test',
        upstreams: { test: { baseUrl: 'https://test.com' } },
      }),
    );

    const { loadConfigFile } = await import('../src/utils/config.js');
    const config = await loadConfigFile(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.version).toBe('1.0');
    expect(config!.currentUpstream).toBe('test');
  });

  it('loads config from .codeproxy.json', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, '.codeproxy.json'),
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'test',
        upstreams: { test: { baseUrl: 'https://test.com' } },
      }),
    );

    const { loadConfigFile } = await import('../src/utils/config.js');
    const config = await loadConfigFile(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.currentUpstream).toBe('test');
  });

  it('returns null when no config found', async () => {
    const { loadConfigFile } = await import('../src/utils/config.js');
    const config = await loadConfigFile(tmpDir);
    expect(config).toBeNull();
  });

  it('returns null when config is invalid JSON', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'codeproxy.config.json'), 'not-json');

    const { loadConfigFile } = await import('../src/utils/config.js');
    const config = await loadConfigFile(tmpDir);
    expect(config).toBeNull();
  });

  it('walks up directories to find config', async () => {
    // Create nested dir structure with config in parent
    const nestedDir = join(tmpDir, 'a', 'b', 'c');
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'codeproxy.config.json'),
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'found',
        upstreams: { found: { baseUrl: 'https://found.com' } },
      }),
    );

    const { loadConfigFile } = await import('../src/utils/config.js');
    const config = await loadConfigFile(nestedDir);
    expect(config).not.toBeNull();
    expect(config!.currentUpstream).toBe('found');
  });
});
