import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  handleExecuteSparqlQuery,
  handleExecuteSparqlUpdate,
  handleListGraphs,
} from '../../src/tools/sparql.js';

// Mock the SparqlClient
vi.mock('../../src/api/sparql-client.js', () => ({
  SparqlClient: vi.fn().mockImplementation(() => ({
    executeQuery: vi.fn().mockResolvedValue({ head: { vars: ['test'] }, results: { bindings: [] } }),
    executeUpdate: vi.fn().mockResolvedValue('Update successful'),
    listGraphs: vi.fn().mockResolvedValue([{ uri: 'http://example.org/graph1' }]),
  })),
}));

describe('SPARQL tools endpoint validation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleExecuteSparqlQuery', () => {
    it('throws error when custom endpoint is provided with allowOtherEndpoints=false', async () => {
      const input = {
        query: 'SELECT * WHERE { ?s ?p ?o }',
        endpoint: 'http://custom.example.org/sparql',
      };

      await expect(
        handleExecuteSparqlQuery(input, 'http://default.example.org/sparql', '', '', false),
      ).rejects.toThrow('Custom SPARQL endpoints are not allowed');
    });

    it('allows custom endpoint when allowOtherEndpoints=true', async () => {
      const input = {
        query: 'SELECT * WHERE { ?s ?p ?o }',
        endpoint: 'http://custom.example.org/sparql',
      };

      const result = await handleExecuteSparqlQuery(
        input,
        'http://default.example.org/sparql',
        '',
        '',
        true,
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('uses default endpoint when no custom endpoint provided', async () => {
      const input = {
        query: 'SELECT * WHERE { ?s ?p ?o }',
      };

      const result = await handleExecuteSparqlQuery(
        input,
        'http://default.example.org/sparql',
        '',
        '',
        false,
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('throws error when no endpoint available at all', async () => {
      const input = {
        query: 'SELECT * WHERE { ?s ?p ?o }',
      };

      await expect(handleExecuteSparqlQuery(input, undefined, '', '', false)).rejects.toThrow(
        'No SPARQL endpoint configured',
      );
    });
  });

  describe('handleExecuteSparqlUpdate', () => {
    it('throws error when custom endpoint is provided with allowOtherEndpoints=false', async () => {
      const input = {
        update: 'INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }',
        endpoint: 'http://custom.example.org/sparql',
      };

      await expect(
        handleExecuteSparqlUpdate(input, 'http://default.example.org/sparql', '', '', false),
      ).rejects.toThrow('Custom SPARQL endpoints are not allowed');
    });

    it('allows custom endpoint when allowOtherEndpoints=true', async () => {
      const input = {
        update: 'INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }',
        endpoint: 'http://custom.example.org/sparql',
      };

      const result = await handleExecuteSparqlUpdate(
        input,
        'http://default.example.org/sparql',
        '',
        '',
        true,
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('uses default endpoint when no custom endpoint provided', async () => {
      const input = {
        update: 'INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }',
      };

      const result = await handleExecuteSparqlUpdate(
        input,
        'http://default.example.org/sparql',
        '',
        '',
        false,
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('throws error when no endpoint available at all', async () => {
      const input = {
        update: 'INSERT DATA { <http://example.org/s> <http://example.org/p> <http://example.org/o> }',
      };

      await expect(handleExecuteSparqlUpdate(input, undefined, '', '', false)).rejects.toThrow(
        'No SPARQL endpoint configured',
      );
    });
  });

  describe('handleListGraphs', () => {
    it('throws error when custom endpoint is provided with allowOtherEndpoints=false', async () => {
      const input = {
        endpoint: 'http://custom.example.org/sparql',
      };

      await expect(
        handleListGraphs(input, 'http://default.example.org/sparql', '', '', false),
      ).rejects.toThrow('Custom SPARQL endpoints are not allowed');
    });

    it('allows custom endpoint when allowOtherEndpoints=true', async () => {
      const input = {
        endpoint: 'http://custom.example.org/sparql',
      };

      const result = await handleListGraphs(
        input,
        'http://default.example.org/sparql',
        '',
        '',
        true,
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('uses default endpoint when no custom endpoint provided', async () => {
      const input = {};

      const result = await handleListGraphs(
        input,
        'http://default.example.org/sparql',
        '',
        '',
        false,
      );

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });

    it('throws error when no endpoint available at all', async () => {
      const input = {};

      await expect(handleListGraphs(input, undefined, '', '', false)).rejects.toThrow(
        'No SPARQL endpoint configured',
      );
    });
  });
});
