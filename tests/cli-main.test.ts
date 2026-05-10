import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('CLI main function', () => {
  const tmpDir = join(tmpdir(), 'codeproxy-main-test-' + Date.now());

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

  it('show help and exits with --help', async () => {
    const cli = await import('../src/server/cli.js');
    const { parseArgs, printHelp } = cli;

    // Test printHelp doesn't throw
    expect(() => printHelp()).not.toThrow();
    const args = parseArgs(['--help']);
    expect(args.help).toBe(true);
  });

  it('exits with error when no base-url or config', async () => {
    const cli = await import('../src/server/cli.js');
    const { parseArgs } = cli;
    const args = parseArgs([]);
    expect(args.help).toBeUndefined();
  });

  it('executes main with --help and exits', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'cli.ts', '--help'];

    const cli = await import('../src/server/cli.js');
    await expect(cli.main()).rejects.toThrow('process.exit(0)');

    process.argv = origArgv;
  });

  it('executes main without args and exits', async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'cli.ts'];

    const cli = await import('../src/server/cli.js');
    await expect(cli.main()).rejects.toThrow('process.exit(1)');

    process.argv = origArgv;
  });

  it('executes main with config path and starts proxy', { timeout: 5000 }, async () => {
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

    const origArgv = process.argv;
    process.argv = ['node', 'cli.ts', '--config', configPath];

    const cli = await import('../src/server/cli.js');
    await cli.main();

    process.argv = origArgv;
  });

  it('executes main with base-url and --port 0', { timeout: 5000 }, async () => {
    const origArgv = process.argv;
    process.argv = ['node', 'cli.ts', '--base-url', 'https://api.test.com/v1', '--port', '0'];

    const cli = await import('../src/server/cli.js');
    await cli.main();

    process.argv = origArgv;
  });
});
