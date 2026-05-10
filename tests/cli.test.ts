// ==============================================================================
// CLI Argument Parsing
// ==============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('CLI argument parsing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses --help flag', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--help']);
    expect(args.help).toBe(true);
  });

  it('parses -h flag', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['-h']);
    expect(args.help).toBe(true);
  });

  it('parses --port with value', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--port', '9999']);
    expect(args.port).toBe(9999);
  });

  it('parses -p with value', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['-p', '8787']);
    expect(args.port).toBe(8787);
  });

  it('parses --host', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--host', '0.0.0.0']);
    expect(args.host).toBe('0.0.0.0');
  });

  it('parses --upstream-format', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--upstream-format', 'anthropic']);
    expect(args.upstreamFormat).toBe('anthropic');
  });

  it('parses --base-url', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--base-url', 'https://api.anthropic.com']);
    expect(args.baseUrl).toBe('https://api.anthropic.com');
  });

  it('parses --config', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--config', 'my-config.json']);
    expect(args.config).toBe('my-config.json');
  });

  it('parses --api-version', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--api-version', '2023-06-01']);
    expect(args.apiVersion).toBe('2023-06-01');
  });

  it('parses --apikey', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--apikey', 'sk-xxx']);
    expect(args.apikey).toBe('sk-xxx');
  });

  it('parses --model', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--model', 'claude-3']);
    expect(args.model).toBe('claude-3');
  });

  it('parses --drop-images', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--drop-images']);
    expect(args.dropImages).toBe(true);
  });

  it('parses --no-cors', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--no-cors']);
    expect(args.cors).toBe(false);
  });

  it('handles unknown argument with help', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const args = parseArgs(['--unknown-flag']);
    expect(args.help).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown argument'));
    consoleSpy.mockRestore();
  });

  it('parses --upstream-format= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--upstream-format=openai-chat']);
    expect(args.upstreamFormat).toBe('openai-chat');
  });

  it('parses --port= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--port=3000']);
    expect(args.port).toBe(3000);
  });

  it('parses --host= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--host=127.0.0.1']);
    expect(args.host).toBe('127.0.0.1');
  });

  it('parses --base-url= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--base-url=https://api.test.com']);
    expect(args.baseUrl).toBe('https://api.test.com');
  });

  it('parses --config= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--config=./cfg.json']);
    expect(args.config).toBe('./cfg.json');
  });

  it('printHelp outputs usage', async () => {
    const { printHelp } = await import('../src/server/cli.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    printHelp();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('codeproxy'));
    logSpy.mockRestore();
  });
});

describe('CLI =value parsing', () => {
  it('parses --api-version= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--api-version=2023-06-01']);
    expect(args.apiVersion).toBe('2023-06-01');
  });

  it('parses --apikey= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--apikey=sk-xxx']);
    expect(args.apikey).toBe('sk-xxx');
  });

  it('parses --model= value syntax', async () => {
    const { parseArgs } = await import('../src/server/cli.js');
    const args = parseArgs(['--model=claude-3']);
    expect(args.model).toBe('claude-3');
  });
});
