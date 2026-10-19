import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer, ResourceMetadata } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import { CacheKeys } from '../cache/keys.js';
import { handleGetConcept } from '../tools/concepts.js';
import { handleLabels } from '../tools/labels.js';
import { handleVocabularySchemaOverview } from '../tools/assist.js';
import { handleSparqlTemplates } from '../tools/sparql.js';
import { SPARQL_REFERENCE } from './sparql-reference.js';

type Variables = Record<string, string | string[]>;

function param(variables: Variables, key: string): string {
  const raw = variables[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new Error(`Missing ${key} parameter`);
  }
  return value;
}

function handlerText(result: { content: Array<{ type: 'text'; text: string }> }): string {
  return result.content[0]?.text ?? '';
}

const JSON_RESOURCE: ResourceMetadata = { mimeType: 'application/json' };

export function registerResources(
  server: McpServer,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
): void {
  // Static resource: list of all vocabularies
  server.registerResource(
    'vocabularies',
    'skosmos://vocabularies',
    { description: 'All vocabularies in the Skosmos instance', ...JSON_RESOURCE },
    async (uri) => {
      const lang = config.defaultLanguage;
      const cacheKey = CacheKeys.listVocabularies(lang);
      let data = cache.vocabularies.get(cacheKey);
      if (!data) {
        data = await client.getVocabularies(lang);
        cache.vocabularies.set(cacheKey, data);
      }
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data) }] };
    },
  );

  // Vocabulary info. Listing enumerates the vocabularies, so clients can discover each URI.
  server.registerResource(
    'vocabulary',
    new ResourceTemplate('skosmos://{vocid}', {
      list: async () => {
        const lang = config.defaultLanguage;
        const cacheKey = CacheKeys.listVocabularies(lang);
        let data = cache.vocabularies.get(cacheKey);
        if (!data) {
          data = await client.getVocabularies(lang);
          cache.vocabularies.set(cacheKey, data);
        }
        return {
          resources: data.vocabularies.map((vocabulary) => ({
            uri: `skosmos://${vocabulary.id}`,
            name: vocabulary.id,
            title: vocabulary.title,
            ...JSON_RESOURCE,
          })),
        };
      },
    }),
    { description: 'One vocabulary with its concept schemes', ...JSON_RESOURCE },
    async (uri, variables) => {
      const vocid = param(variables, 'vocid');
      const lang = config.defaultLanguage;
      const cacheKey = CacheKeys.getVocabulary(vocid, lang);
      let data = cache.vocabulary.get(cacheKey);
      if (!data) {
        data = await client.getVocabulary(vocid, lang);
        cache.vocabulary.set(cacheKey, data);
      }
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data) }] };
    },
  );

  // Concept details: the same data as the get_concept tool
  server.registerResource(
    'concept',
    new ResourceTemplate('skosmos://{vocid}/{encodedUri}', { list: undefined }),
    { description: 'Concept with labels, broader, narrower and related concepts', ...JSON_RESOURCE },
    async (uri, variables) => {
      const vocid = param(variables, 'vocid');
      const conceptUri = decodeURIComponent(param(variables, 'encodedUri'));
      const text = handlerText(
        await handleGetConcept({ uri: conceptUri, vocabulary: vocid }, client, cache, config),
      );
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
    },
  );

  // Concept labels: the same data as the labels tool
  server.registerResource(
    'concept-labels',
    new ResourceTemplate('skosmos://{vocid}/{encodedUri}/labels', { list: undefined }),
    { description: 'All labels (prefLabel, altLabel, hiddenLabel) for a concept', ...JSON_RESOURCE },
    async (uri, variables) => {
      const vocid = param(variables, 'vocid');
      const conceptUri = decodeURIComponent(param(variables, 'encodedUri'));
      const text = handlerText(await handleLabels({ uri: conceptUri, vocabulary: vocid }, client, cache, config));
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
    },
  );

  // Vocabulary structure summary: the same data as the vocabulary_schema_overview tool
  server.registerResource(
    'vocabulary-overview',
    new ResourceTemplate('skosmos-overview://{vocid}', { list: undefined }),
    { description: 'Structure summary of a vocabulary: entry points, relationship hints, suggested tasks', ...JSON_RESOURCE },
    async (uri, variables) => {
      const id = param(variables, 'vocid');
      const text = handlerText(await handleVocabularySchemaOverview({ id }, client, cache, config));
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
    },
  );

  // SPARQL query templates: the same data as the sparql_query_templates tool
  server.registerResource(
    'sparql-templates',
    new ResourceTemplate('skosmos-sparql://templates/{category}', { list: undefined }),
    { description: 'SKOS SPARQL query templates for one category', ...JSON_RESOURCE },
    async (uri, variables) => {
      const category = param(variables, 'category');
      const text = handlerText(await handleSparqlTemplates({ category }));
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
    },
  );

  // SPARQL syntax reference, moved out of the tool descriptions
  server.registerResource(
    'sparql-reference',
    'skosmos-sparql://reference',
    { description: 'SPARQL query, update and named graph reference for this server', mimeType: 'text/markdown' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: SPARQL_REFERENCE }] }),
  );
}
