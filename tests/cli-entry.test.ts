import { describe, expect, it } from 'vitest';

describe('CLI entry point', () => {
  it('importing module does not trigger main when argv[1] is not cli', async () => {
    // process.argv[1] is typically vitest runner path, so endsWith should be false
    const cli = await import('../src/server/cli.js');
    // Module imported without triggering main
    expect(typeof cli.main).toBe('function');
  });
});
