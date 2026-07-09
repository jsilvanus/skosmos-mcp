import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import type { TraversalEngine } from '../traversal/engine.js';

export const broaderConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export const narrowerConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export const relatedConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export const traverseConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  relationships: z.array(z.enum(['broader', 'narrower', 'related'])).min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

function getClient(client: SkosmosClient, config: Config, serverUrl?: string): SkosmosClient | undefined {
  if (serverUrl && config.toolServerUrlAllowed) {
    return client.withBaseUrl(serverUrl);
  }
  return undefined;
}

export async function handleBroaderConcepts(
  args: z.infer<typeof broaderConceptsSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
  traversal: TraversalEngine,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const depth = Math.min(args.depth ?? config.maxTraversalDepth, config.maxTraversalDepth);
  const cacheKey = `traversal:broader:${args.vocabulary}:${args.uri}:${depth}:${lang}`;
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseBroader(args.vocabulary, args.uri, depth, lang, activeClient);
  cache.traversal.set(cacheKey, result);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleNarrowerConcepts(
  args: z.infer<typeof narrowerConceptsSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
  traversal: TraversalEngine,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const depth = Math.min(args.depth ?? config.maxTraversalDepth, config.maxTraversalDepth);
  const cacheKey = `traversal:narrower:${args.vocabulary}:${args.uri}:${depth}:${lang}`;
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseNarrower(args.vocabulary, args.uri, depth, lang, activeClient);
  cache.traversal.set(cacheKey, result);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleRelatedConcepts(
  args: z.infer<typeof relatedConceptsSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
  traversal: TraversalEngine,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const depth = Math.min(args.depth ?? config.maxTraversalDepth, config.maxTraversalDepth);
  const cacheKey = `traversal:related:${args.vocabulary}:${args.uri}:${depth}:${lang}`;
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseRelated(args.vocabulary, args.uri, depth, lang, activeClient);
  cache.traversal.set(cacheKey, result);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleTraverseConcepts(
  args: z.infer<typeof traverseConceptsSchema>,
  client: SkosmosClient,
  cache: CacheManager,
  config: Config,
  traversal: TraversalEngine,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const depth = Math.min(args.depth ?? config.maxTraversalDepth, config.maxTraversalDepth);
  const relsKey = [...args.relationships].sort().join(',');
  const cacheKey = `traversal:mixed:${args.vocabulary}:${args.uri}:${relsKey}:${depth}:${lang}`;
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseMixed(args.vocabulary, args.uri, args.relationships, depth, lang, activeClient);
  cache.traversal.set(cacheKey, result);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
