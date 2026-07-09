import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import { getClient } from './utils.js';

export const labelsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export async function handleLabels(
  args: z.infer<typeof labelsSchema>,
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
