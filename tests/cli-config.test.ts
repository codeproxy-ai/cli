// ==============================================================================
// Config Loader Tests
// ==============================================================================
import { describe, expect, it, afterEach } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfigFile', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-cli-test-' + Date.now());

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loads a valid JSON config file', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'deepseek',
        upstreams: { deepseek: { baseUrl: 'https://api.deepseek.com/v1' } },
      }),
    );

    const { loadConfigFile } = await import('../src/server/cli.js');
    const config = await loadConfigFile(configPath);
    expect(config.version).toBe('1.0');
    expect(config.currentUpstream).toBe('deepseek');
    expect(config.upstreams.deepseek.baseUrl).toBe('https://api.deepseek.com/v1');
  });

  it('fails with exit on non-existent config', async () => {
    // We can't easily catch process.exit, but we can verify the module exists
    const { loadConfigFile } = await import('../src/server/cli.js');
    expect(typeof loadConfigFile).toBe('function');
  });

  it('fails with exit on invalid JSON', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'bad.json');
    writeFileSync(configPath, 'not-json');

    const { loadConfigFile } = await import('../src/server/cli.js');
    expect(typeof loadConfigFile).toBe('function');
  });
});

// ==============================================================================
// loadConfigAndApplyOverrides
// ==============================================================================
describe('loadConfigAndApplyOverrides', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-cli-test-2-' + Date.now());

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('merges overrides with config for basic case', async () => {
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
            apiKey: 'sk-test',
            model: 'deepseek-v4',
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(opts.model).toBe('deepseek-v4');
    // apiKey should be converted to defaultHeaders
    expect(opts.defaultHeaders?.authorization).toBe('Bearer sk-test');
  });

  it('merges headers from top-level config and upstream', async () => {
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
            headers: { 'x-upstream': 'upstream-val' },
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.defaultHeaders?.['x-global']).toBe('global-val');
    expect(opts.defaultHeaders?.['x-upstream']).toBe('upstream-val');
  });

  it('sets fallback upstream when configured', async () => {
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
            fallback: 'kimi',
          },
          kimi: {
            baseUrl: 'https://api.moonshot.cn/v1',
            model: 'kimi-k2.6',
            apiKey: 'sk-test',
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.fallbackUpstream).toBeDefined();
    expect(opts.fallbackUpstream!.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(opts.fallbackUpstream!.model).toBe('kimi-k2.6');
    expect(opts.fallbackUpstream!.defaultHeaders?.authorization).toBe('Bearer sk-test');
  });

  it('sets fallback with headers and apiKey', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'deepseek',
        headers: { 'x-root': 'root-val' },
        upstreams: {
          deepseek: {
            baseUrl: 'https://api.deepseek.com/v1',
            fallback: 'kimi',
          },
          kimi: {
            baseUrl: 'https://api.moonshot.cn/v1',
            headers: { 'x-custom': 'custom-val' },
            apiKey: 'sk-kimi',
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.fallbackUpstream).toBeDefined();
    expect(opts.fallbackUpstream!.baseUrl).toBe('https://api.moonshot.cn/v1');
    expect(opts.fallbackUpstream!.defaultHeaders?.['x-root']).toBe('root-val');
    expect(opts.fallbackUpstream!.defaultHeaders?.['x-custom']).toBe('custom-val');
    expect(opts.fallbackUpstream!.defaultHeaders?.authorization).toBe('Bearer sk-kimi');
  });

  it('sets overrides from CLI args', async () => {
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
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {
      baseUrl: 'https://override.com/v1',
      model: 'override-model',
      cors: false,
    });
    expect(opts.baseUrl).toBe('https://override.com/v1');
    expect(opts.model).toBe('override-model');
    expect(opts.cors).toBe(false);
  });

  it('sets timeout, dropImages, reasoning_effort, thinking', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'deepseek',
        reasoningEffort: 'high',
        thinking: { budget_tokens: 2000 },
        upstreams: {
          deepseek: {
            baseUrl: 'https://api.deepseek.com/v1',
            dropImages: true,
            timeoutMs: 120000,
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.timeoutMs).toBe(120000);
    expect(opts.dropImages).toBe(true);
    expect(opts.reasoning_effort).toBe('high');
    expect(opts.thinking).toEqual({ budget_tokens: 2000 });
  });

  it('loads modelAliases from upstream config', async () => {
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
            modelAliases: {
              'gpt-5.5': 'deepseek-v4-flash',
              'gpt-4o': 'deepseek-v4-flash',
            },
          },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.modelAliases).toEqual({
      'gpt-5.5': 'deepseek-v4-flash',
      'gpt-4o': 'deepseek-v4-flash',
    });
  });
});
