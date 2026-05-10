import { describe, expect, it } from 'vitest';

describe('proxy helper coverage', () => {
  it('imports proxy module successfully', async () => {
    const mod = await import('../src/server/proxy.js');
    expect(typeof mod.startProxy).toBe('function');
    expect(typeof mod.flattenIncomingHeaders).toBe('function');
  });
});
