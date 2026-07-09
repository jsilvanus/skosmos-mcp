import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import { CacheKeys } from '../cache/keys.js';
import { getClient } from './utils.js';

export const listVocabulariesSchema = z.object({
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export const getVocabularySchema = z.object({
  id: z.string().min(1),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export async function handleListVocabularies(
  args: z.infer<typeof listVocabulariesSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cacheKey = CacheKeys.listVocabularies(args.lang, args.server_url);
  const cached = cache.vocabularies.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const response = await activeClient.getVocabularies(args.lang);
  cache.vocabularies.set(cacheKey, response);
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}

export async function handleGetVocabulary(
  args: z.infer<typeof getVocabularySchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const cacheKey = CacheKeys.getVocabulary(args.id, lang, args.server_url);
  const cached = cache.vocabulary.get(cacheKey);

  const activeClient = getClient(client, config, args.server_url);

  let vocabInfo;
  if (cached) {
    vocabInfo = cached;
  } else {
    vocabInfo = await activeClient.getVocabulary(args.id, lang);
    cache.vocabulary.set(cacheKey, vocabInfo);
  }

  const topConcepts = await activeClient.getTopConcepts(args.id, lang);

  const result = {
    vocabulary: vocabInfo,
    topConcepts: topConcepts.topconcepts ?? [],
  };
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
