import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';

export function registerResources(
  server: McpServer,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
): void {
  // Static resource: list of all vocabularies
  server.resource('vocabularies', 'skosmos://vocabularies', async (_uri) => {
    const lang = config.defaultLanguage;
    const cacheKey = `vocabularies:${lang}`;
    let data = cache.vocabularies.get(cacheKey);
    if (!data) {
      data = await client.getVocabularies(lang);
      cache.vocabularies.set(cacheKey, data);
    }
    return {
      contents: [
        {
          uri: 'skosmos://vocabularies',
          mimeType: 'application/json',
          text: JSON.stringify(data),
        },
      ],
    };
  });

  // Dynamic resource: vocabulary info
  server.resource(
    'vocabulary',
    new ResourceTemplate('skosmos://{vocid}', { list: undefined }),
    async (uri, params) => {
      const vocid = Array.isArray(params['vocid']) ? params['vocid'][0] : params['vocid'];
      if (!vocid) {
        throw new Error('Missing vocid parameter');
      }
      const lang = config.defaultLanguage;
      const cacheKey = `vocabulary:${vocid}:${lang}`;
      let data = cache.vocabulary.get(cacheKey);
      if (!data) {
        data = await client.getVocabulary(vocid, lang);
        cache.vocabulary.set(cacheKey, data);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(data),
          },
        ],
      };
    },
  );

  // Dynamic resource: concept
  server.resource(
    'concept',
    new ResourceTemplate('skosmos://{vocid}/{encodedUri}', { list: undefined }),
    async (uri, params) => {
      const vocid = Array.isArray(params['vocid']) ? params['vocid'][0] : params['vocid'];
      const encodedUri = Array.isArray(params['encodedUri'])
        ? params['encodedUri'][0]
        : params['encodedUri'];

      if (!vocid || !encodedUri) {
        throw new Error('Missing vocid or encodedUri parameter');
      }

      const conceptUri = decodeURIComponent(encodedUri);
      const lang = config.defaultLanguage;
      const cacheKey = `label:${vocid}:${conceptUri}:${lang}`;

      let labelData = cache.labels.get(cacheKey);
      if (!labelData) {
        labelData = await client.getConceptLabel(vocid, conceptUri, lang);
        cache.labels.set(cacheKey, labelData);
      }

      const [broaderRes, narrowerRes, relatedRes] = await Promise.all([
        client.getBroader(vocid, conceptUri, lang),
        client.getNarrower(vocid, conceptUri, lang),
        client.getRelated(vocid, conceptUri, lang),
      ]);

      const concept = {
        uri: conceptUri,
        prefLabel: labelData.prefLabel,
        altLabel: labelData.altLabel,
        broader: broaderRes.broader ?? [],
        narrower: narrowerRes.narrower ?? [],
        related: relatedRes.related ?? [],
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(concept),
          },
        ],
      };
    },
  );
}
