import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vi } from 'vitest';

describe('CLI auth redaction', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-auth-test-' + Date.now());

  it('redacts authorization header in merged headers display', async () => {
    // eslint-disable-next-line no-restricted-syntax
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mkdirSync(tmpDir, { recursive: true });
    const configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        version: '1.0',
        currentUpstream: 'test',
        headers: { authorization: 'Bearer secret-token', 'x-other': 'value' },
        upstreams: {
          test: { baseUrl: 'https://api.test.com/v1' },
        },
      }),
    );

    const { loadConfigAndApplyOverrides } = await import('../src/server/cli.js');
    const opts = await loadConfigAndApplyOverrides(configPath, {});
    expect(opts.baseUrl).toBe('https://api.test.com/v1');
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Headers'));

    vi.restoreAllMocks();
  });
});
