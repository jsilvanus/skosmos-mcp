import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import { getClient } from './utils.js';

export const searchConceptsSchema = z.object({
  query: z.string().min(1),
  vocabulary: z.string().optional(),
  lang: z.string().optional(),
  maxhits: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  server_url: z.string().url().optional(),
});

export const autocompleteSchema = z.object({
  prefix: z.string().min(1),
  vocabulary: z.string().optional(),
  lang: z.string().optional(),
  maxhits: z.number().int().positive().optional(),
  server_url: z.string().url().optional(),
});

export const resolveLabelSchema = z.object({
  text: z.string().min(1),
  vocabulary: z.string().min(1),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export async function handleSearchConcepts(
  args: z.infer<typeof searchConceptsSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const cacheKey = `search:${args.query}:${args.vocabulary ?? ''}:${lang}:${args.maxhits ?? ''}:${args.offset ?? ''}`;
  const cached = cache.search.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);

  let response;
  if (args.vocabulary) {
    response = await activeClient.searchInVocabulary(args.vocabulary, {
      query: args.query,
      lang,
      ...(args.maxhits !== undefined && { maxhits: args.maxhits }),
      ...(args.offset !== undefined && { offset: args.offset }),
    });
  } else {
    response = await activeClient.search({
      query: args.query,
      lang,
      ...(args.maxhits !== undefined && { maxhits: args.maxhits }),
      ...(args.offset !== undefined && { offset: args.offset }),
    });
  }

  cache.search.set(cacheKey, response);
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}

export async function handleAutocomplete(
  args: z.infer<typeof autocompleteSchema>,
  client: SkosmosClient,
  _cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const activeClient = getClient(client, config, args.server_url);

  let response;
  if (args.vocabulary) {
    response = await activeClient.searchInVocabulary(args.vocabulary, {
      query: args.prefix + '*',
      lang,
      ...(args.maxhits !== undefined && { maxhits: args.maxhits }),
      unique: true,
    });
  } else {
    response = await activeClient.search({
      query: args.prefix + '*',
      lang,
      ...(args.maxhits !== undefined && { maxhits: args.maxhits }),
      unique: true,
    });
  }

  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}

export async function handleResolveLabel(
  args: z.infer<typeof resolveLabelSchema>,
  client: SkosmosClient,
  _cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const activeClient = getClient(client, config, args.server_url);
  const response = await activeClient.lookup(args.vocabulary, args.text, lang);
  return { content: [{ type: 'text', text: JSON.stringify(response) }] };
}
