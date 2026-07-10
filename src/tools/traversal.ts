import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import type { TraversalEngine } from '../traversal/engine.js';
import { CacheKeys } from '../cache/keys.js';
import { getClient } from './utils.js';

export const broaderConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  include_explanation: z.boolean().optional(),
  server_url: z.string().url().optional(),
});

export const narrowerConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  include_explanation: z.boolean().optional(),
  server_url: z.string().url().optional(),
});

export const relatedConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  include_explanation: z.boolean().optional(),
  server_url: z.string().url().optional(),
});

export const traverseConceptsSchema = z.object({
  uri: z.string().url(),
  vocabulary: z.string().min(1),
  relationships: z.array(z.enum(['broader', 'narrower', 'related'])).min(1),
  depth: z.number().int().positive().optional(),
  lang: z.string().optional(),
  include_explanation: z.boolean().optional(),
  server_url: z.string().url().optional(),
});

function buildTraversalExplanation(
  uri: string,
  vocabulary: string,
  relation: 'broader' | 'narrower' | 'related' | 'mixed',
  depth: number,
  traversalResult: { nodes: Array<{ depth: number }>; edges: Array<unknown>; rootUri: string },
): Record<string, unknown> {
  return {
    requestedUri: uri,
    vocabulary,
    relation,
    requestedDepth: depth,
    nodeCount: traversalResult.nodes.length,
    edgeCount: traversalResult.edges.length,
    rootUri: traversalResult.rootUri,
    summary: `Discovered ${traversalResult.nodes.length} concepts and ${traversalResult.edges.length} relationships in a ${relation} traversal.`,
  };
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
  const cacheKey = CacheKeys.traversal(
    args.uri,
    args.vocabulary,
    'broader',
    lang,
    depth,
    undefined,
    args.server_url,
    args.include_explanation,
  );
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseBroader(args.vocabulary, args.uri, depth, lang, activeClient);
  const payload = args.include_explanation
    ? { ...result, explanation: buildTraversalExplanation(args.uri, args.vocabulary, 'broader', depth, result) }
    : result;
  cache.traversal.set(cacheKey, payload);
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
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
  const cacheKey = CacheKeys.traversal(
    args.uri,
    args.vocabulary,
    'narrower',
    lang,
    depth,
    undefined,
    args.server_url,
    args.include_explanation,
  );
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseNarrower(args.vocabulary, args.uri, depth, lang, activeClient);
  const payload = args.include_explanation
    ? { ...result, explanation: buildTraversalExplanation(args.uri, args.vocabulary, 'narrower', depth, result) }
    : result;
  cache.traversal.set(cacheKey, payload);
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
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
  const cacheKey = CacheKeys.traversal(
    args.uri,
    args.vocabulary,
    'related',
    lang,
    depth,
    undefined,
    args.server_url,
    args.include_explanation,
  );
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseRelated(args.vocabulary, args.uri, depth, lang, activeClient);
  const payload = args.include_explanation
    ? { ...result, explanation: buildTraversalExplanation(args.uri, args.vocabulary, 'related', depth, result) }
    : result;
  cache.traversal.set(cacheKey, payload);
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
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
  const cacheKey = CacheKeys.traversal(
    args.uri,
    args.vocabulary,
    'traverse',
    lang,
    depth,
    args.relationships,
    args.server_url,
    args.include_explanation,
  );
  const cached = cache.traversal.get(cacheKey);
  if (cached) {
    return { content: [{ type: 'text', text: JSON.stringify(cached) }] };
  }

  const activeClient = getClient(client, config, args.server_url);
  const result = await traversal.traverseMixed(args.vocabulary, args.uri, args.relationships, depth, lang, activeClient);
  const payload = args.include_explanation
    ? { ...result, explanation: buildTraversalExplanation(args.uri, args.vocabulary, 'mixed', depth, result) }
    : result;
  cache.traversal.set(cacheKey, payload);
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}
