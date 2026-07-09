import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';

export const listVocabulariesSchema = z.object({
  lang: z.string().optional(),
});

export const getVocabularySchema = z.object({
  id: z.string().min(1),
  lang: z.string().optional(),
});

export async function handleListVocabularies(
  args: z.infer<typeof listVocabulariesSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  _config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const cacheKey = `vocabularies:${args.lang ?? ''}`;
  const cached = cache.vocabularies.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const response = await client.getVocabularies(args.lang);
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
  const cacheKey = `vocabulary:${args.id}:${lang}`;
  const cached = cache.vocabulary.get(cacheKey);

  let vocabInfo;
  if (cached) {
    vocabInfo = cached;
  } else {
    vocabInfo = await client.getVocabulary(args.id, lang);
    cache.vocabulary.set(cacheKey, vocabInfo);
  }

  const topConcepts = await client.getTopConcepts(args.id, lang);

  const result = {
    vocabulary: vocabInfo,
    topConcepts: topConcepts.topconcepts ?? [],
  };
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
