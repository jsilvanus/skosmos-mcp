import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TraversalEngine } from '../../src/traversal/engine.js';
import type { SkosmosClient } from '../../src/api/client.js';
import type { Config } from '../../src/config/index.js';

const mockConfig: Config = {
  baseUrl: 'https://skosmos.example.org',
  defaultLanguage: 'en',
  timeout: 5000,
  userAgent: 'test/1.0',
  cacheTtl: 300,
  maxTraversalDepth: 3,
};

function makeMockClient(): SkosmosClient {
  return {
    getBroader: vi.fn(),
    getNarrower: vi.fn(),
    getRelated: vi.fn(),
    getConceptLabel: vi.fn(),
    getVocabularies: vi.fn(),
    getVocabulary: vi.fn(),
    getTopConcepts: vi.fn(),
    search: vi.fn(),
    searchInVocabulary: vi.fn(),
    lookup: vi.fn(),
    lookupLabel: vi.fn(),
    getBroaderTransitive: vi.fn(),
    getNarrowerTransitive: vi.fn(),
    getChildren: vi.fn(),
    getHierarchy: vi.fn(),
    getGroups: vi.fn(),
    getGroupMembers: vi.fn(),
    getMappings: vi.fn(),
  } as unknown as SkosmosClient;
}

describe('TraversalEngine', () => {
  let client: SkosmosClient;
  let engine: TraversalEngine;

  beforeEach(() => {
    client = makeMockClient();
    engine = new TraversalEngine(client, mockConfig);
  });

  describe('traverseBroader', () => {
    it('returns root node at depth 0', async () => {
      vi.mocked(client.getBroader).mockResolvedValue({ broader: [] });

      const result = await engine.traverseBroader('vocab', 'http://example.org/A', 1);
      expect(result.rootUri).toBe('http://example.org/A');
      expect(result.nodes[0]?.concept.uri).toBe('http://example.org/A');
      expect(result.nodes[0]?.depth).toBe(0);
    });

    it('traverses broader concepts in BFS order', async () => {
      vi.mocked(client.getBroader)
        .mockResolvedValueOnce({
          broader: [
            { uri: 'http://example.org/B', prefLabel: 'B' },
            { uri: 'http://example.org/C', prefLabel: 'C' },
          ],
        })
        .mockResolvedValueOnce({ broader: [{ uri: 'http://example.org/D', prefLabel: 'D' }] })
        .mockResolvedValueOnce({ broader: [] });

      const result = await engine.traverseBroader('vocab', 'http://example.org/A', 2);

      const uris = result.nodes.map((n) => n.concept.uri);
      expect(uris[0]).toBe('http://example.org/A');
      // BFS: depth 1 nodes (B, C) should come before depth 2 nodes (D)
      const depthOfB = result.nodes.find((n) => n.concept.uri === 'http://example.org/B')?.depth;
      const depthOfC = result.nodes.find((n) => n.concept.uri === 'http://example.org/C')?.depth;
      const depthOfD = result.nodes.find((n) => n.concept.uri === 'http://example.org/D')?.depth;
      expect(depthOfB).toBe(1);
      expect(depthOfC).toBe(1);
      expect(depthOfD).toBe(2);
    });

    it('detects cycles and does not revisit nodes', async () => {
      // A -> B -> A (cycle)
      vi.mocked(client.getBroader)
        .mockImplementation(async (_vocid, uri) => {
          if (uri === 'http://example.org/A') {
            return { broader: [{ uri: 'http://example.org/B', prefLabel: 'B' }] };
          }
          if (uri === 'http://example.org/B') {
            return { broader: [{ uri: 'http://example.org/A', prefLabel: 'A' }] };
          }
          return { broader: [] };
        });

      const result = await engine.traverseBroader('vocab', 'http://example.org/A', 3);

      const uris = result.nodes.map((n) => n.concept.uri);
      // A should appear only once despite the cycle
      expect(uris.filter((u) => u === 'http://example.org/A').length).toBe(1);
    });

    it('respects max depth cap from config', async () => {
      vi.mocked(client.getBroader).mockResolvedValue({
        broader: [{ uri: 'http://example.org/X', prefLabel: 'X' }],
      });

      // Request depth 100 but config caps at 3
      const result = await engine.traverseBroader('vocab', 'http://example.org/A', 100);
      expect(result.maxDepth).toBe(3);

      const maxActualDepth = Math.max(...result.nodes.map((n) => n.depth));
      expect(maxActualDepth).toBeLessThanOrEqual(3);
    });

    it('records edges correctly', async () => {
      vi.mocked(client.getBroader)
        .mockResolvedValueOnce({ broader: [{ uri: 'http://example.org/B', prefLabel: 'B' }] })
        .mockResolvedValueOnce({ broader: [] });

      const result = await engine.traverseBroader('vocab', 'http://example.org/A', 1);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0]?.fromUri).toBe('http://example.org/A');
      expect(result.edges[0]?.toUri).toBe('http://example.org/B');
      expect(result.edges[0]?.relation).toBe('broader');
    });
  });

  describe('traverseNarrower', () => {
    it('traverses narrower concepts', async () => {
      vi.mocked(client.getNarrower)
        .mockResolvedValueOnce({
          narrower: [{ uri: 'http://example.org/child', prefLabel: 'Child' }],
        })
        .mockResolvedValueOnce({ narrower: [] });

      const result = await engine.traverseNarrower('vocab', 'http://example.org/A', 1);
      const childNode = result.nodes.find((n) => n.concept.uri === 'http://example.org/child');
      expect(childNode).toBeDefined();
      expect(childNode?.depth).toBe(1);
    });
  });

  describe('traverseRelated', () => {
    it('traverses related concepts', async () => {
      vi.mocked(client.getRelated)
        .mockResolvedValueOnce({ related: [{ uri: 'http://example.org/related', prefLabel: 'Related' }] })
        .mockResolvedValueOnce({ related: [] });

      const result = await engine.traverseRelated('vocab', 'http://example.org/A', 1);
      const relatedNode = result.nodes.find((n) => n.concept.uri === 'http://example.org/related');
      expect(relatedNode).toBeDefined();
    });
  });

  describe('traverseMixed', () => {
    it('traverses multiple relationship types', async () => {
      vi.mocked(client.getBroader).mockResolvedValue({
        broader: [{ uri: 'http://example.org/broader', prefLabel: 'Broader' }],
      });
      vi.mocked(client.getNarrower).mockResolvedValue({
        narrower: [{ uri: 'http://example.org/narrower', prefLabel: 'Narrower' }],
      });

      const result = await engine.traverseMixed(
        'vocab',
        'http://example.org/A',
        ['broader', 'narrower'],
        1,
      );

      const uris = result.nodes.map((n) => n.concept.uri);
      expect(uris).toContain('http://example.org/broader');
      expect(uris).toContain('http://example.org/narrower');
    });
  });
});
