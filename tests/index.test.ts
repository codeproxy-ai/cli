import { describe, it, expect } from 'vitest';

describe('package exports', () => {
  it('exports createResponsesFetch', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.createResponsesFetch).toBe('function');
  });

  it('exports startProxy', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.startProxy).toBe('function');
  });

  it('exports RunningProxy type', async () => {
    // RunningProxy is a type-only export; verify the re-export path works
    const proxyMod = await import('../src/server/proxy.js');
    expect(typeof proxyMod.startProxy).toBe('function');
    // RunningProxy is a type (not runtime value), so just verify the module imports
    const indexMod = await import('../src/index.js');
    expect(indexMod).toBeDefined();
  });
});
