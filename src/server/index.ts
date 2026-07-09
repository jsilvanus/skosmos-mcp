import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { Config } from '../config/index.js';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { TraversalEngine } from '../traversal/engine.js';
import { SkosmosError, NotFoundError, ApiError } from '../util/errors.js';
import { logger } from '../util/logger.js';
import {
  handleListVocabularies,
  handleGetVocabulary,
} from '../tools/vocabularies.js';
import {
  handleGetConcept,
  handleGetConceptLabel,
  handleConceptPath,
} from '../tools/concepts.js';
import {
  handleSearchConcepts,
  handleAutocomplete,
  handleResolveLabel,
} from '../tools/search.js';
import { handleLabels } from '../tools/labels.js';
import {
  handleBroaderConcepts,
  handleNarrowerConcepts,
  handleRelatedConcepts,
  handleTraverseConcepts,
} from '../tools/traversal.js';
import { registerResources } from './resources.js';

function translateError(err: unknown): McpError {
  if (err instanceof NotFoundError) {
    return new McpError(ErrorCode.InvalidRequest, err.message);
  }
  if (err instanceof ApiError) {
    if (err.statusCode === 400) return new McpError(ErrorCode.InvalidParams, err.message);
    return new McpError(ErrorCode.InternalError, err.message);
  }
  if (err instanceof SkosmosError) {
    return new McpError(ErrorCode.InternalError, err.message);
  }
  if (err instanceof Error) {
    return new McpError(ErrorCode.InternalError, err.message);
  }
  return new McpError(ErrorCode.InternalError, 'Unknown error');
}

type ToolResult = { content: Array<{ type: 'text'; text: string }> };

function wrapHandler<T extends Record<string, unknown>>(
  handler: (args: T) => Promise<ToolResult>,
): (args: T) => Promise<ToolResult> {
  return async (args: T): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (err) {
      logger.error('Tool handler error', { error: err instanceof Error ? err.message : String(err) });
      throw translateError(err);
    }
  };
}

export function createServer(
  config: Config,
  client: SkosmosClient,
  traversalEngine: TraversalEngine,
  cacheManager: CacheManager,
): McpServer {
  const server = new McpServer({
    name: 'skosmos-mcp',
    version: '0.1.0',
  });

  // --- Vocabulary tools ---

  server.tool(
    'list_vocabularies',
    'List all available vocabularies in the Skosmos instance',
    { lang: z.string().optional().describe('Language code for labels (e.g. "en", "fi")') },
    wrapHandler(async (args) => handleListVocabularies(args, client, cacheManager, config)),
  );

  server.tool(
    'get_vocabulary',
    'Get details of a specific vocabulary including top concepts',
    {
      id: z.string().min(1).describe('Vocabulary identifier (e.g. "stw", "yso")'),
      lang: z.string().optional().describe('Language code for labels'),
    },
    wrapHandler(async (args) => handleGetVocabulary(args, client, cacheManager, config)),
  );

  // --- Concept tools ---

  server.tool(
    'get_concept',
    'Get full concept details including broader, narrower, and related concepts',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().optional().describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code for labels'),
    },
    wrapHandler(async (args) => handleGetConcept(args, client, cacheManager, config)),
  );

  server.tool(
    'get_concept_label',
    'Get all labels (prefLabel, altLabel, hiddenLabel) for a concept URI',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) => handleGetConceptLabel(args, client, cacheManager, config)),
  );

  server.tool(
    'concept_path',
    'Get the hierarchy path from a concept to its root via broader transitive relations',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) => handleConceptPath(args, client, cacheManager, config)),
  );

  // --- Search tools ---

  server.tool(
    'search_concepts',
    'Full-text search for concepts across one or all vocabularies',
    {
      query: z.string().min(1).describe('Search query string'),
      vocabulary: z.string().optional().describe('Limit search to this vocabulary'),
      lang: z.string().optional().describe('Language code'),
      maxhits: z.number().int().positive().optional().describe('Maximum number of results'),
      offset: z.number().int().nonnegative().optional().describe('Result offset for pagination'),
    },
    wrapHandler(async (args) => handleSearchConcepts(args, client, cacheManager, config)),
  );

  server.tool(
    'autocomplete',
    'Autocomplete concept labels by prefix',
    {
      prefix: z.string().min(1).describe('Label prefix to complete'),
      vocabulary: z.string().optional().describe('Limit to this vocabulary'),
      lang: z.string().optional().describe('Language code'),
      maxhits: z.number().int().positive().optional().describe('Maximum number of suggestions'),
    },
    wrapHandler(async (args) => handleAutocomplete(args, client, cacheManager, config)),
  );

  server.tool(
    'resolve_label',
    'Resolve a label text to concepts in a vocabulary',
    {
      text: z.string().min(1).describe('Label text to resolve'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) => handleResolveLabel(args, client, cacheManager, config)),
  );

  // --- Labels tool ---

  server.tool(
    'labels',
    'Get all labels for a concept URI in a vocabulary',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) => handleLabels(args, client, cacheManager, config)),
  );

  // --- Traversal tools ---

  server.tool(
    'broader_concepts',
    'BFS traversal of broader (parent) concepts up to a specified depth',
    {
      uri: z.string().url().describe('Starting concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      depth: z.number().int().positive().optional().describe('Maximum traversal depth'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) =>
      handleBroaderConcepts(args, client, cacheManager, config, traversalEngine),
    ),
  );

  server.tool(
    'narrower_concepts',
    'BFS traversal of narrower (child) concepts down to a specified depth',
    {
      uri: z.string().url().describe('Starting concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      depth: z.number().int().positive().optional().describe('Maximum traversal depth'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) =>
      handleNarrowerConcepts(args, client, cacheManager, config, traversalEngine),
    ),
  );

  server.tool(
    'related_concepts',
    'BFS traversal of related concepts up to a specified depth',
    {
      uri: z.string().url().describe('Starting concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      depth: z.number().int().positive().optional().describe('Maximum traversal depth'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) =>
      handleRelatedConcepts(args, client, cacheManager, config, traversalEngine),
    ),
  );

  server.tool(
    'traverse_concepts',
    'BFS traversal using a mix of broader, narrower, and/or related relationships',
    {
      uri: z.string().url().describe('Starting concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      relationships: z
        .array(z.enum(['broader', 'narrower', 'related']))
        .min(1)
        .describe('Relationship types to traverse'),
      depth: z.number().int().positive().optional().describe('Maximum traversal depth'),
      lang: z.string().optional().describe('Language code'),
    },
    wrapHandler(async (args) =>
      handleTraverseConcepts(args, client, cacheManager, config, traversalEngine),
    ),
  );

  // Register resources
  registerResources(server, client, cacheManager, config);

  return server;
}
