import type { Config } from '../config/index.js';
import type { SkosmosClient } from '../api/client.js';
import type { ConceptRef, TraversalResult, TraversalNode, TraversalEdge } from '../models/index.js';
import { logger } from '../util/logger.js';

export interface TraversalOptions {
  vocid: string;
  uri: string;
  relationships: ('broader' | 'narrower' | 'related')[];
  maxDepth: number;
  lang?: string;
}

interface QueueItem {
  uri: string;
  depth: number;
  parentUri?: string;
  relation: 'broader' | 'narrower' | 'related';
}

export class TraversalEngine {
  private readonly client: SkosmosClient;
  private readonly config: Config;

  constructor(client: SkosmosClient, config: Config) {
    this.client = client;
    this.config = config;
  }

  async traverse(options: TraversalOptions): Promise<TraversalResult> {
    const maxDepth = Math.min(options.maxDepth, this.config.maxTraversalDepth);
    const visited = new Set<string>();
    const nodes: TraversalNode[] = [];
    const edges: TraversalEdge[] = [];

    // Root node (depth 0)
    const rootConcept: ConceptRef = { uri: options.uri };
    nodes.push({
      concept: rootConcept,
      depth: 0,
      relation: options.relationships.length === 1 ? options.relationships[0]! : 'mixed',
    });
    visited.add(options.uri);

    const queue: QueueItem[] = [];

    // Seed the queue with all requested relationships from the root
    for (const rel of options.relationships) {
      queue.push({ uri: options.uri, depth: 0, relation: rel });
    }

    while (queue.length > 0) {
      // queue.length > 0 guarantees shift() returns a value
      const item = queue.shift() as QueueItem;

      if (item.depth >= maxDepth) continue;

      const nextDepth = item.depth + 1;
      let neighbors: ConceptRef[] = [];

      try {
        neighbors = await this.fetchNeighbors(options.vocid, item.uri, item.relation, options.lang);
      } catch (err) {
        logger.warn('Failed to fetch neighbors during traversal', {
          uri: item.uri,
          relation: item.relation,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      for (const neighbor of neighbors) {
        // Record edge regardless of visited state
        edges.push({ fromUri: item.uri, toUri: neighbor.uri, relation: item.relation });

        if (!visited.has(neighbor.uri)) {
          visited.add(neighbor.uri);

          const nodeRelation: 'broader' | 'narrower' | 'related' | 'mixed' =
            options.relationships.length === 1 ? options.relationships[0]! : item.relation;

          nodes.push({
            concept: neighbor,
            depth: nextDepth,
            relation: nodeRelation,
            parentUri: item.uri,
          });

          // Continue BFS from this neighbor for same relationship
          if (nextDepth < maxDepth) {
            for (const rel of options.relationships) {
              queue.push({
                uri: neighbor.uri,
                depth: nextDepth,
                parentUri: item.uri,
                relation: rel,
              });
            }
          }
        }
      }
    }

    return { nodes, edges, rootUri: options.uri, maxDepth };
  }

  private async fetchNeighbors(
    vocid: string,
    uri: string,
    relation: 'broader' | 'narrower' | 'related',
    lang?: string,
  ): Promise<ConceptRef[]> {
    const toRef = (c: { uri: string; prefLabel?: string; notation?: string }): ConceptRef => {
      const ref: ConceptRef = { uri: c.uri };
      if (c.prefLabel !== undefined) ref.prefLabel = c.prefLabel;
      if (c.notation !== undefined) ref.notation = c.notation;
      return ref;
    };
    if (relation === 'broader') {
      const response = await this.client.getBroader(vocid, uri, lang);
      return (response.broader ?? []).map(toRef);
    } else if (relation === 'narrower') {
      const response = await this.client.getNarrower(vocid, uri, lang);
      return (response.narrower ?? []).map(toRef);
    } else {
      const response = await this.client.getRelated(vocid, uri, lang);
      return (response.related ?? []).map(toRef);
    }
  }

  async traverseBroader(
    vocid: string,
    uri: string,
    depth?: number,
    lang?: string,
  ): Promise<TraversalResult> {
    const opts: TraversalOptions = {
      vocid,
      uri,
      relationships: ['broader'],
      maxDepth: depth ?? this.config.maxTraversalDepth,
    };
    if (lang !== undefined) opts.lang = lang;
    return this.traverse(opts);
  }

  async traverseNarrower(
    vocid: string,
    uri: string,
    depth?: number,
    lang?: string,
  ): Promise<TraversalResult> {
    const opts: TraversalOptions = {
      vocid,
      uri,
      relationships: ['narrower'],
      maxDepth: depth ?? this.config.maxTraversalDepth,
    };
    if (lang !== undefined) opts.lang = lang;
    return this.traverse(opts);
  }

  async traverseRelated(
    vocid: string,
    uri: string,
    depth?: number,
    lang?: string,
  ): Promise<TraversalResult> {
    const opts: TraversalOptions = {
      vocid,
      uri,
      relationships: ['related'],
      maxDepth: depth ?? this.config.maxTraversalDepth,
    };
    if (lang !== undefined) opts.lang = lang;
    return this.traverse(opts);
  }

  async traverseMixed(
    vocid: string,
    uri: string,
    relationships: ('broader' | 'narrower' | 'related')[],
    depth?: number,
    lang?: string,
  ): Promise<TraversalResult> {
    const opts: TraversalOptions = {
      vocid,
      uri,
      relationships,
      maxDepth: depth ?? this.config.maxTraversalDepth,
    };
    if (lang !== undefined) opts.lang = lang;
    return this.traverse(opts);
  }
}
