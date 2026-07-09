import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import { ApiError } from '../util/errors.js';

export const getConceptSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().optional(),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export const getConceptLabelSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export const conceptPathSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

function getClient(client: SkosmosClient, config: Config, serverUrl?: string): SkosmosClient {
  if (serverUrl && config.toolServerUrlAllowed) {
    return client.withBaseUrl(serverUrl);
  }
  return client;
}

export async function handleGetConcept(
  args: z.infer<typeof getConceptSchema>,
  client: SkosmosClient,
  _cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const vocid = args.vocabulary ?? config.defaultVocabulary;

  if (!vocid) {
    throw new ApiError('vocabulary parameter is required when SKOSMOS_DEFAULT_VOCABULARY is not set', 400);
  }

  const activeClient = getClient(client, config, args.server_url);

  const [labelRes, broaderRes, narrowerRes, relatedRes] = await Promise.all([
    activeClient.getConceptLabel(vocid, args.uri, lang),
    activeClient.getBroader(vocid, args.uri, lang),
    activeClient.getNarrower(vocid, args.uri, lang),
    activeClient.getRelated(vocid, args.uri, lang),
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

  const activeClient = getClient(client, config, args.server_url);
  const response = await activeClient.getConceptLabel(args.vocabulary, args.uri, lang);
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
  const activeClient = getClient(client, config, args.server_url);
  const response = await activeClient.getHierarchy(args.vocabulary, args.uri, lang);
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}
