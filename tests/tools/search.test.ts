import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSearchConcepts, handleAutocomplete, handleResolveLabel } from '../../src/tools/search.js';
import type { SkosmosClient } from '../../src/api/client.js';
import type { CacheManager } from '../../src/cache/index.js';
import type { Config } from '../../src/config/index.js';
import { Cache } from '../../src/cache/index.js';
import type { SearchResponse, LookupResponse } from '../../src/models/index.js';

const mockConfig: Config = {
  baseUrl: 'https://skosmos.example.org',
  defaultLanguage: 'en',
  timeout: 5000,
  userAgent: 'test/1.0',
  cacheTtl: 300,
  maxTraversalDepth: 3,
};

function makeMockCache(): CacheManager {
  return {
    vocabularies: new Cache(300),
    vocabulary: new Cache(300),
    labels: new Cache(300),
    search: new Cache<SearchResponse>(300),
    traversal: new Cache(300),
    clearAll: vi.fn(),
  } as unknown as CacheManager;
}

function makeMockClient(): SkosmosClient {
  return {
    search: vi.fn(),
    searchInVocabulary: vi.fn(),
    lookup: vi.fn(),
  } as unknown as SkosmosClient;
}

describe('search_concepts tool', () => {
  let client: SkosmosClient;
  let cache: CacheManager;

  beforeEach(() => {
    client = makeMockClient();
    cache = makeMockCache();
  });

  it('calls global search when no vocabulary specified', async () => {
    const mockData: SearchResponse = { results: [{ uri: 'http://example.org/A', prefLabel: 'Alpha' }] };
    vi.mocked(client.search).mockResolvedValue(mockData);

    const result = await handleSearchConcepts({ query: 'alpha' }, client, cache, mockConfig);
    expect(vi.mocked(client.search)).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'alpha' }),
    );
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.results).toHaveLength(1);
  });

  it('calls vocabulary search when vocabulary specified', async () => {
    const mockData: SearchResponse = { results: [] };
    vi.mocked(client.searchInVocabulary).mockResolvedValue(mockData);

    await handleSearchConcepts({ query: 'water', vocabulary: 'yso' }, client, cache, mockConfig);
    expect(vi.mocked(client.searchInVocabulary)).toHaveBeenCalledWith(
      'yso',
      expect.objectContaining({ query: 'water' }),
    );
    expect(vi.mocked(client.search)).not.toHaveBeenCalled();
  });

  it('passes maxhits and offset', async () => {
    vi.mocked(client.search).mockResolvedValue({ results: [] });

    await handleSearchConcepts({ query: 'test', maxhits: 5, offset: 10 }, client, cache, mockConfig);
    expect(vi.mocked(client.search)).toHaveBeenCalledWith(
      expect.objectContaining({ maxhits: 5, offset: 10 }),
    );
  });

  it('returns cached result on second identical call', async () => {
    vi.mocked(client.search).mockResolvedValue({ results: [] });

    await handleSearchConcepts({ query: 'foo' }, client, cache, mockConfig);
    await handleSearchConcepts({ query: 'foo' }, client, cache, mockConfig);
    expect(vi.mocked(client.search)).toHaveBeenCalledTimes(1);
  });
});

describe('autocomplete tool', () => {
  let client: SkosmosClient;
  let cache: CacheManager;

  beforeEach(() => {
    client = makeMockClient();
    cache = makeMockCache();
  });

  it('appends wildcard to prefix for global search', async () => {
    vi.mocked(client.search).mockResolvedValue({ results: [] });

    await handleAutocomplete({ prefix: 'wat' }, client, cache, mockConfig);
    expect(vi.mocked(client.search)).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'wat*', unique: true }),
    );
  });

  it('uses vocabulary search with wildcard when vocabulary provided', async () => {
    vi.mocked(client.searchInVocabulary).mockResolvedValue({ results: [] });

    await handleAutocomplete({ prefix: 'eco', vocabulary: 'yso' }, client, cache, mockConfig);
    expect(vi.mocked(client.searchInVocabulary)).toHaveBeenCalledWith(
      'yso',
      expect.objectContaining({ query: 'eco*', unique: true }),
    );
  });
});

describe('resolve_label tool', () => {
  let client: SkosmosClient;
  let cache: CacheManager;

  beforeEach(() => {
    client = makeMockClient();
    cache = makeMockCache();
  });

  it('calls lookup with correct parameters', async () => {
    const mockData: LookupResponse = { results: [{ uri: 'http://example.org/water', prefLabel: 'water' }] };
    vi.mocked(client.lookup).mockResolvedValue(mockData);

    const result = await handleResolveLabel({ text: 'water', vocabulary: 'yso' }, client, cache, mockConfig);
    expect(vi.mocked(client.lookup)).toHaveBeenCalledWith('yso', 'water', 'en');
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.results[0].uri).toBe('http://example.org/water');
  });
});
