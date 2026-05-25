// ==============================================================================
// Config Validation
// ==============================================================================
import { describe, expect, it } from 'vitest';
import {
  validateConfig,
  validateUpstreamConfig,
  getCurrentUpstreamConfig,
} from '../src/utils/config.js';

describe('validateConfig', () => {
  it('validates a valid config', () => {
    const config = {
      version: '1.0',
      currentUpstream: 'deepseek',
      upstreams: {
        deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-...' },
      },
    };
    expect(validateConfig(config)).toEqual({ valid: true });
  });

  it('rejects null config', () => {
    expect(validateConfig(null)).toEqual({ valid: false, error: 'Config must be an object' });
  });

  it('rejects non-object config', () => {
    expect(validateConfig('string')).toEqual({ valid: false, error: 'Config must be an object' });
  });

  it('rejects missing version', () => {
    expect(validateConfig({ currentUpstream: 'x', upstreams: {} })).toEqual({
      valid: false,
      error: 'Config must have a version string',
    });
  });

  it('rejects missing currentUpstream', () => {
    expect(validateConfig({ version: '1.0', upstreams: {} })).toEqual({
      valid: false,
      error: 'Config must have a currentUpstream string',
    });
  });

  it('rejects non-object upstreams', () => {
    expect(validateConfig({ version: '1.0', currentUpstream: 'x', upstreams: 'string' })).toEqual({
      valid: false,
      error: 'Config must have an upstreams object',
    });
  });

  it('rejects when currentUpstream not in upstreams', () => {
    expect(validateConfig({ version: '1.0', currentUpstream: 'x', upstreams: {} })).toEqual({
      valid: false,
      error: 'currentUpstream "x" not found in upstreams',
    });
  });

  it('rejects invalid upstream', () => {
    expect(validateConfig({ version: '1.0', currentUpstream: 'x', upstreams: { x: {} } })).toEqual({
      valid: false,
      error: 'Upstream "x" is invalid: baseUrl is required and must be a string',
    });
  });
});

describe('validateUpstreamConfig', () => {
  it('validates a valid upstream', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url' })).toEqual({ valid: true });
  });

  it('rejects null', () => {
    expect(validateUpstreamConfig(null)).toEqual({
      valid: false,
      error: 'Upstream config must be an object',
    });
  });

  it('rejects non-object', () => {
    expect(validateUpstreamConfig(123)).toEqual({
      valid: false,
      error: 'Upstream config must be an object',
    });
  });

  it('rejects missing baseUrl', () => {
    expect(validateUpstreamConfig({})).toEqual({
      valid: false,
      error: 'baseUrl is required and must be a string',
    });
  });

  it('rejects non-string baseUrl', () => {
    expect(validateUpstreamConfig({ baseUrl: 123 })).toEqual({
      valid: false,
      error: 'baseUrl is required and must be a string',
    });
  });

  it('rejects invalid format', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', format: 'invalid' })).toEqual({
      valid: false,
      error: 'Invalid format: invalid. Must be one of: anthropic, openai-chat',
    });
  });

  it('accepts valid format', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', format: 'anthropic' }).valid).toBe(true);
    expect(validateUpstreamConfig({ baseUrl: 'url', format: 'openai-chat' }).valid).toBe(true);
  });

  it('validates apiKey type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', apiKey: 123 }).valid).toBe(false);
    expect(validateUpstreamConfig({ baseUrl: 'url', apiKey: 'valid' }).valid).toBe(true);
  });

  it('validates model type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', model: 456 }).valid).toBe(false);
    expect(validateUpstreamConfig({ baseUrl: 'url', model: 'valid' }).valid).toBe(true);
  });

  it('validates modelAliases type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', modelAliases: 'bad' })).toEqual({
      valid: false,
      error: 'modelAliases must be an object if provided',
    });
    expect(validateUpstreamConfig({ baseUrl: 'url', modelAliases: { 'gpt-5.5': 123 } })).toEqual({
      valid: false,
      error: 'modelAliases["gpt-5.5"] must be a string',
    });
    expect(
      validateUpstreamConfig({
        baseUrl: 'url',
        modelAliases: { 'gpt-5.5': 'deepseek-v4-flash' },
      }).valid,
    ).toBe(true);
  });

  it('validates dropImages type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', dropImages: 'yes' }).valid).toBe(false);
    expect(validateUpstreamConfig({ baseUrl: 'url', dropImages: true }).valid).toBe(true);
  });

  it('validates headers type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', headers: 'not-object' }).valid).toBe(false);
    expect(validateUpstreamConfig({ baseUrl: 'url', headers: { key: 'val' } }).valid).toBe(true);
  });

  it('validates apiVersion type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', apiVersion: 123 }).valid).toBe(false);
    expect(validateUpstreamConfig({ baseUrl: 'url', apiVersion: '2023-06-01' }).valid).toBe(true);
  });

  it('validates fallback type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', fallback: 123 }).valid).toBe(false);
    expect(validateUpstreamConfig({ baseUrl: 'url', fallback: 'other' }).valid).toBe(true);
  });

  it('validates reasoningEffort type', () => {
    expect(validateUpstreamConfig({ baseUrl: 'url', reasoningEffort: 123 }).valid).toBe(false);
    expect(validateUpstreamConfig({ baseUrl: 'url', reasoningEffort: 'medium' }).valid).toBe(true);
  });
});

describe('getCurrentUpstreamConfig', () => {
  it('returns the correct upstream', () => {
    const config: {
      version: string;
      currentUpstream: string;
      upstreams: Record<string, { baseUrl: string }>;
    } = {
      version: '1',
      currentUpstream: 'x',
      upstreams: { x: { baseUrl: 'url' }, y: { baseUrl: 'url2' } },
    };

    expect(getCurrentUpstreamConfig(config)?.baseUrl).toBe('url');
  });

  it('returns null for missing upstream', () => {
    const config: {
      version: string;
      currentUpstream: string;
      upstreams: Record<string, { baseUrl: string }>;
    } = {
      version: '1',
      currentUpstream: 'nonexistent',
      upstreams: { x: { baseUrl: 'url' } },
    };

    expect(getCurrentUpstreamConfig(config)).toBeNull();
  });
});
