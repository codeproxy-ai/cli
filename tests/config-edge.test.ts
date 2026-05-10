import { describe, expect, it } from 'vitest';
import { validateUpstreamConfig } from '../src/utils/config.js';

describe('validateUpstreamConfig edge cases', () => {
  it('rejects non-string format', () => {
    const result = validateUpstreamConfig({ baseUrl: 'url', format: 123 });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('format must be a string');
  });

  it('accepts valid format string', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', format: 'anthropic' }).valid).toBe(true);
    expect(validateUpstreamConfig({ baseUrl: 'url', format: 'openai-chat' }).valid).toBe(true);
  });

  it('rejects invalid format string', () => {
    const result = validateUpstreamConfig({ baseUrl: 'url', format: 'invalid-format' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid format');
  });
});
