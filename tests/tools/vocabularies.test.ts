import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleListVocabularies, handleGetVocabulary } from '../../src/tools/vocabularies.js';
import type { SkosmosClient } from '../../src/api/client.js';
import type { CacheManager } from '../../src/cache/index.js';
import type { Config } from '../../src/config/index.js';
import { Cache } from '../../src/cache/index.js';
import type {
  VocabulariesResponse,
  VocabularyInfoResponse,
} from '../../src/models/index.js';

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
    vocabularies: new Cache<VocabulariesResponse>(300),
    vocabulary: new Cache<VocabularyInfoResponse>(300),
    labels: new Cache(300),
    search: new Cache(300),
    traversal: new Cache(300),
    clearAll: vi.fn(),
  } as unknown as CacheManager;
}

function makeMockClient(): SkosmosClient {
  return {
    getVocabularies: vi.fn(),
    getVocabulary: vi.fn(),
    getTopConcepts: vi.fn(),
  } as unknown as SkosmosClient;
}

describe('list_vocabularies tool', () => {
  let client: SkosmosClient;
  let cache: CacheManager;

  beforeEach(() => {
    client = makeMockClient();
    cache = makeMockCache();
  });

  it('returns vocabularies from API', async () => {
    const mockData: VocabulariesResponse = {
      vocabularies: [{ id: 'yso', title: 'YSO', defaultLanguage: 'fi' }],
    };
    vi.mocked(client.getVocabularies).mockResolvedValue(mockData);

    const result = await handleListVocabularies({ lang: 'en' }, client, cache, mockConfig);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe('text');
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.vocabularies).toHaveLength(1);
    expect(parsed.vocabularies[0].id).toBe('yso');
  });

  it('returns cached result on second call', async () => {
    const mockData: VocabulariesResponse = {
      vocabularies: [{ id: 'stw', title: 'STW' }],
    };
    vi.mocked(client.getVocabularies).mockResolvedValue(mockData);

    await handleListVocabularies({}, client, cache, mockConfig);
    await handleListVocabularies({}, client, cache, mockConfig);

    // API should only be called once
    expect(vi.mocked(client.getVocabularies)).toHaveBeenCalledTimes(1);
  });

  it('works without lang parameter', async () => {
    const mockData: VocabulariesResponse = { vocabularies: [] };
    vi.mocked(client.getVocabularies).mockResolvedValue(mockData);

    const result = await handleListVocabularies({}, client, cache, mockConfig);
    expect(result.content[0]?.type).toBe('text');
  });
});

describe('get_vocabulary tool', () => {
  let client: SkosmosClient;
  let cache: CacheManager;

  beforeEach(() => {
    client = makeMockClient();
    cache = makeMockCache();
  });

  it('returns vocabulary info and top concepts', async () => {
    const vocabData: VocabularyInfoResponse = {
      id: 'yso',
      title: 'YSO',
      defaultLanguage: 'fi',
      languages: ['fi', 'en'],
    };
    const topConceptsData = {
      topconcepts: [{ uri: 'http://example.org/A', prefLabel: 'A', hasChildren: true }],
    };

    vi.mocked(client.getVocabulary).mockResolvedValue(vocabData);
    vi.mocked(client.getTopConcepts).mockResolvedValue(topConceptsData);

    const result = await handleGetVocabulary({ id: 'yso' }, client, cache, mockConfig);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.vocabulary.id).toBe('yso');
    expect(parsed.topConcepts).toHaveLength(1);
  });

  it('uses default language from config when lang not specified', async () => {
    vi.mocked(client.getVocabulary).mockResolvedValue({ id: 'yso', title: 'YSO' });
    vi.mocked(client.getTopConcepts).mockResolvedValue({ topconcepts: [] });

    await handleGetVocabulary({ id: 'yso' }, client, cache, mockConfig);

    expect(vi.mocked(client.getVocabulary)).toHaveBeenCalledWith('yso', 'en');
  });
});
