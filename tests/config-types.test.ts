import { describe, expect, it } from 'vitest';

// Test types/config.ts - CONFIG_FILE_NAMES and type exports
describe('config types', () => {
  it('exports CONFIG_FILE_NAMES', async () => {
    // Access through the re-export path
    const configModule = await import('../src/types/config.js');
    expect(configModule.CONFIG_FILE_NAMES).toBeDefined();
    expect(Array.isArray(configModule.CONFIG_FILE_NAMES)).toBe(true);
    expect(configModule.CONFIG_FILE_NAMES.length).toBeGreaterThan(0);
    expect(configModule.CONFIG_FILE_NAMES).toContain('codeproxy.config.json');
    expect(configModule.CONFIG_FILE_NAMES).toContain('.codeproxy.json');
  });
});
