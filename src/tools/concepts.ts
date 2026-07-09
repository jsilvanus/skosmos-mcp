import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';

export const getConceptSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().optional(),
  lang: z.string().optional(),
});

export const getConceptLabelSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  lang: z.string().optional(),
});

export const conceptPathSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  lang: z.string().optional(),
});

export async function handleGetConcept(
  args: z.infer<typeof getConceptSchema>,
  client: SkosmosClient,
  _cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const vocid = args.vocabulary ?? config.defaultVocabulary;

  if (!vocid) {
    throw new Error('vocabulary parameter is required when SKOSMOS_DEFAULT_VOCABULARY is not set');
  }

  const [labelRes, broaderRes, narrowerRes, relatedRes] = await Promise.all([
    client.getConceptLabel(vocid, args.uri, lang),
    client.getBroader(vocid, args.uri, lang),
    client.getNarrower(vocid, args.uri, lang),
    client.getRelated(vocid, args.uri, lang),
  ]);

  const result = {
    uri: args.uri,
    prefLabel: labelRes.prefLabel,
    altLabel: labelRes.altLabel,
    broader: broaderRes.broader ?? [],
    narrower: narrowerRes.narrower ?? [],
    related: relatedRes.related ?? [],
  };
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleGetConceptLabel(
  args: z.infer<typeof getConceptLabelSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const cacheKey = `label:${args.vocabulary}:${args.uri}:${lang}`;
  const cached = cache.labels.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const response = await client.getConceptLabel(args.vocabulary, args.uri, lang);
  cache.labels.set(cacheKey, response);
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}

export async function handleConceptPath(
  args: z.infer<typeof conceptPathSchema>,
  client: SkosmosClient,
  _cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const response = await client.getHierarchy(args.vocabulary, args.uri, lang);
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}
