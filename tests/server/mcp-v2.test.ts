import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { SkosmosClient } from '../../src/api/client.js';
import type { Config } from '../../src/config/index.js';
import { loadConfig } from '../../src/config/index.js';
import { CacheManager } from '../../src/cache/index.js';
import { TraversalEngine } from '../../src/traversal/engine.js';
import { createServer } from '../../src/server/index.js';

const CONCEPT = 'http://www.yso.fi/onto/yso/p1';
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

function fakeSkosmosClient() {
  return {
    getVocabularies: vi.fn(async () => ({
      vocabularies: [{ id: 'yso', title: 'YSO' }, { id: 'stw', title: 'STW' }],
    })),
    getVocabulary: vi.fn(async (id: string) => ({ id, title: id.toUpperCase() })),
    getConceptLabel: vi.fn(async (_vocid: string, uri: string) => ({ uri, prefLabel: 'ihmiset' })),
    getBroader: vi.fn(async () => ({ broader: [] })),
    getNarrower: vi.fn(async () => ({ narrower: [] })),
    getRelated: vi.fn(async () => ({ related: [] })),
    withBaseUrl: vi.fn(),
  } as unknown as SkosmosClient & { getConceptLabel: ReturnType<typeof vi.fn> };
}

async function connect(config: Config, skosmos: SkosmosClient) {
  const cacheManager = new CacheManager(config.cacheTtl);
  const traversalEngine = new TraversalEngine(skosmos, config);
  const server = createServer(config, skosmos, traversalEngine, cacheManager);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'mcp-v2-test', version: '1.0.0' });
  await client.connect(clientTransport);
  return { client, server };
}

describe('MCP v2 server surface', () => {
  let config: Config;

  beforeAll(() => {
    process.env['SKOSMOS_BASE_URL'] = 'https://api.example.org';
    process.env['SPARQL_ENDPOINT_URL'] = 'https://api.example.org/sparql';
    config = loadConfig();
  });

  it('reports the package version', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    expect(client.getServerVersion()?.version).toBe(pkg.version);
  });

  it('marks destructive and read-only tools with annotations', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get('execute_sparql_update')?.annotations?.destructiveHint).toBe(true);
    expect(byName.get('execute_sparql_update')?.annotations?.readOnlyHint).toBe(false);
    expect(byName.get('search_concepts')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('execute_sparql_update')?.description).toMatch(/^DESTRUCTIVE/);
  });

  it('deprecates the read tools that have a resource, prompt or merged replacement', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const name of [
      'list_vocabularies',
      'get_vocabulary',
      'get_concept',
      'get_concept_label',
      'labels',
      'vocabulary_schema_overview',
      'query_guidance',
      'suggest_sparql_templates',
      'sparql_query_templates',
      'broader_concepts',
      'narrower_concepts',
      'related_concepts',
    ]) {
      expect(byName.get(name)?.description, name).toMatch(/^DEPRECATED \(use .+; removed in 1\.0\)\./);
    }
    expect(byName.get('traverse_concepts')?.description).not.toMatch(/DEPRECATED/);
    expect(byName.get('search_concepts')?.description).not.toMatch(/DEPRECATED/);
  });

  it('keeps SPARQL syntax text out of the tool descriptions', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description?.length ?? 0, tool.name).toBeLessThan(400);
    }
  });

  it('lists the vocabulary URIs through the template list callback', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri);

    expect(uris).toContain('skosmos://vocabularies');
    expect(uris).toContain('skosmos://yso');
    expect(uris).toContain('skosmos://stw');
  });

  it('exposes the new resource templates', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    const { resourceTemplates } = await client.listResourceTemplates();
    const patterns = resourceTemplates.map((template) => template.uriTemplate);

    expect(patterns).toEqual(
      expect.arrayContaining([
        'skosmos://{vocid}',
        'skosmos://{vocid}/{encodedUri}',
        'skosmos://{vocid}/{encodedUri}/labels',
        'skosmos-overview://{vocid}',
        'skosmos-sparql://templates/{category}',
      ]),
    );
  });

  it('serves the SPARQL reference resource', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    const result = await client.readResource({ uri: 'skosmos-sparql://reference' });
    const text = (result.contents[0] as { text: string }).text;

    expect(text).toContain('SELECT');
    expect(text).toContain('INSERT DATA');
    expect(text).toContain('Named graphs');
  });

  it('reads a concept through the same handler as the get_concept tool', async () => {
    const skosmos = fakeSkosmosClient();
    const { client } = await connect(config, skosmos);
    const uri = `skosmos://yso/${encodeURIComponent(CONCEPT)}`;

    const result = await client.readResource({ uri });
    const concept = JSON.parse((result.contents[0] as { text: string }).text) as { uri: string; prefLabel: string };

    expect(concept.uri).toBe(CONCEPT);
    expect(concept.prefLabel).toBe('ihmiset');
    expect(skosmos.getConceptLabel).toHaveBeenCalledWith('yso', CONCEPT, config.defaultLanguage);
  });

  it('serves the query_guidance prompt', async () => {
    const { client } = await connect(config, fakeSkosmosClient());
    const prompt = await client.getPrompt({ name: 'query_guidance', arguments: { vocabulary: 'yso' } });
    const message = prompt.messages[0]!.content as { type: 'text'; text: string };

    expect(message.text).toContain('"vocabulary": "yso"');
    expect(message.text).toContain('"guidance"');
  });
});
