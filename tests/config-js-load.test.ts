import { describe, expect, it, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfigFile JS/TS loading', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-js-test-' + Date.now());

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('loads .codeproxy.json config', async () => {
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
    expect(config!.version).toBe('1.0');
  });
});
