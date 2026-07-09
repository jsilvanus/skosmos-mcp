import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Cache } from '../../src/cache/index.js';

describe('Cache', () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>(60); // 60 second TTL
  });

  it('returns undefined for missing key', () => {
    expect(cache.get('missing')).toBeUndefined();
  });

  it('sets and gets a value', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns undefined after TTL expires', () => {
    const shortTtlCache = new Cache<string>(0.001); // ~1ms TTL
    shortTtlCache.set('key', 'value');

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(shortTtlCache.get('key')).toBeUndefined();
        resolve();
      }, 10);
    });
  });

  it('deletes a specific key', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.delete('key1');
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
  });

  it('clears all entries', () => {
    cache.set('a', 'A');
    cache.set('b', 'B');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it('tracks size correctly', () => {
    expect(cache.size()).toBe(0);
    cache.set('x', 'X');
    expect(cache.size()).toBe(1);
    cache.set('y', 'Y');
    expect(cache.size()).toBe(2);
    cache.delete('x');
    expect(cache.size()).toBe(1);
  });

  it('overwrites existing value', () => {
    cache.set('key', 'old');
    cache.set('key', 'new');
    expect(cache.get('key')).toBe('new');
    expect(cache.size()).toBe(1);
  });

  it('uses fake timers for TTL test', () => {
    vi.useFakeTimers();
    const ttlCache = new Cache<number>(10); // 10 seconds
    ttlCache.set('k', 42);
    expect(ttlCache.get('k')).toBe(42);

    vi.advanceTimersByTime(10001);
    expect(ttlCache.get('k')).toBeUndefined();

    vi.useRealTimers();
  });
});
