import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleVocabularySchemaOverview,
  handleQueryGuidance,
  handleReconcileConcept,
  handleSuggestSparqlTemplates,
} from '../../src/tools/assist.js';
import type { SkosmosClient } from '../../src/api/client.js';
import type { CacheManager } from '../../src/cache/index.js';
import type { Config } from '../../src/config/index.js';
import { Cache } from '../../src/cache/index.js';

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
    search: new Cache(300),
    traversal: new Cache(300),
    clearAll: vi.fn(),
  } as unknown as CacheManager;
}

function makeMockClient(): SkosmosClient {
  return {
    getVocabulary: vi.fn(),
    getTopConcepts: vi.fn(),
    lookup: vi.fn(),
    searchInVocabulary: vi.fn(),
  } as unknown as SkosmosClient;
}

describe('vocabulary_schema_overview tool', () => {
  let client: SkosmosClient;
  let cache: CacheManager;

  beforeEach(() => {
    client = makeMockClient();
    cache = makeMockCache();
  });

  it('returns a vocabulary summary and top concept preview', async () => {
    vi.mocked(client.getVocabulary).mockResolvedValue({ id: 'yso', title: 'YSO', defaultLanguage: 'en', languages: ['en'] });
    vi.mocked(client.getTopConcepts).mockResolvedValue({ topconcepts: [{ uri: 'http://example.org/1', prefLabel: 'One', hasChildren: true }] });

    const result = await handleVocabularySchemaOverview({ id: 'yso' }, client, cache, mockConfig);
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.vocabulary.id).toBe('yso');
    expect(parsed.vocabulary.title).toBe('YSO');
    expect(parsed.overview.topConceptCount).toBe(1);
    expect(parsed.overview.relationshipHints).toContain('broader');
  });
});

describe('query_guidance tool', () => {
  it('returns guidance tailored to the requested task', async () => {
    const result = await handleQueryGuidance({ vocabulary: 'yso', task: 'hierarchy' }, {} as SkosmosClient, makeMockCache(), mockConfig);
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.guidance).toHaveLength(1);
    expect(parsed.guidance[0].task).toBe('hierarchy');
    expect(parsed.guidance[0].title).toBe('Trace broader and narrower relationships');
    expect(parsed.guidance[0].recommendedTools).toContain('broader_concepts');
  });
});

describe('reconcile_concept tool', () => {
  let client: SkosmosClient;
  let cache: CacheManager;

  beforeEach(() => {
    client = makeMockClient();
    cache = makeMockCache();
  });

  it('uses lookup results when available', async () => {
    vi.mocked(client.lookup).mockResolvedValue({ results: [{ uri: 'http://example.org/concept', prefLabel: 'Water' }] });

    const result = await handleReconcileConcept({ text: 'water', vocabulary: 'yso' }, client, cache, mockConfig);
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.matches[0].matchedBy).toBe('lookup');
    expect(parsed.matchCount).toBe(1);
  });
});

describe('suggest_sparql_templates tool', () => {
  it('returns templates for the requested task', async () => {
    const result = await handleSuggestSparqlTemplates({ task: 'hierarchy' });
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.templates[0].task).toBe('hierarchy');
  });
});
