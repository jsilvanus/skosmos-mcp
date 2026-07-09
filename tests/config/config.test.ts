import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config/index.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when SKOSMOS_BASE_URL is missing', () => {
    delete process.env['SKOSMOS_BASE_URL'];
    expect(() => loadConfig()).toThrow();
  });

  it('throws when SKOSMOS_BASE_URL is not a valid URL', () => {
    process.env['SKOSMOS_BASE_URL'] = 'not-a-url';
    expect(() => loadConfig()).toThrow();
  });

  it('parses valid config with all defaults', () => {
    process.env['SKOSMOS_BASE_URL'] = 'https://skosmos.example.org';
    delete process.env['SKOSMOS_DEFAULT_LANGUAGE'];
    delete process.env['SKOSMOS_TIMEOUT'];
    delete process.env['SKOSMOS_CACHE_TTL'];
    delete process.env['SKOSMOS_MAX_TRAVERSAL_DEPTH'];
    delete process.env['SKOSMOS_USER_AGENT'];

    const config = loadConfig();
    expect(config.baseUrl).toBe('https://skosmos.example.org');
    expect(config.defaultLanguage).toBe('en');
    expect(config.timeout).toBe(30000);
    expect(config.cacheTtl).toBe(300);
    expect(config.maxTraversalDepth).toBe(3);
    expect(config.userAgent).toBe('skosmos-mcp/0.1.0');
  });

  it('parses custom values from environment', () => {
    process.env['SKOSMOS_BASE_URL'] = 'https://api.example.com';
    process.env['SKOSMOS_DEFAULT_LANGUAGE'] = 'fi';
    process.env['SKOSMOS_TIMEOUT'] = '5000';
    process.env['SKOSMOS_CACHE_TTL'] = '60';
    process.env['SKOSMOS_MAX_TRAVERSAL_DEPTH'] = '5';
    process.env['SKOSMOS_USER_AGENT'] = 'my-agent/1.0';

    const config = loadConfig();
    expect(config.baseUrl).toBe('https://api.example.com');
    expect(config.defaultLanguage).toBe('fi');
    expect(config.timeout).toBe(5000);
    expect(config.cacheTtl).toBe(60);
    expect(config.maxTraversalDepth).toBe(5);
    expect(config.userAgent).toBe('my-agent/1.0');
  });

  it('sets defaultVocabulary when env var is provided', () => {
    process.env['SKOSMOS_BASE_URL'] = 'https://skosmos.example.org';
    process.env['SKOSMOS_DEFAULT_VOCABULARY'] = 'yso';

    const config = loadConfig();
    expect(config.defaultVocabulary).toBe('yso');
  });

  it('leaves defaultVocabulary undefined when env var is empty', () => {
    process.env['SKOSMOS_BASE_URL'] = 'https://skosmos.example.org';
    process.env['SKOSMOS_DEFAULT_VOCABULARY'] = '';

    const config = loadConfig();
    expect(config.defaultVocabulary).toBeUndefined();
  });
});
