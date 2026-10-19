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
  handleVocabularySchemaOverview,
  handleQueryGuidance,
  handleReconcileConcept,
  handleSuggestSparqlTemplates,
} from '../tools/assist.js';
import {
  handleBroaderConcepts,
  handleNarrowerConcepts,
  handleRelatedConcepts,
  handleTraverseConcepts,
} from '../tools/traversal.js';
import {
  handleExecuteSparqlQuery,
  handleExecuteSparqlUpdate,
  handleListGraphs,
  handleSparqlTemplates,
} from '../tools/sparql.js';
import { registerResources } from './resources.js';
import { registerPrompts } from './prompts.js';
import { outputSchemas } from './output-schemas.js';
import { registerReadTool, registerWriteTool } from './registration.js';
import { createRequire } from 'node:module';

const { version: SERVER_VERSION } = createRequire(import.meta.url)('../../package.json') as { version: string };

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

type ToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: Record<string, unknown> };

/**
 * Adds structuredContent when the text is a JSON object, so tools with an outputSchema can validate it.
 */
function withStructuredContent(result: ToolResult): ToolResult {
  const text = result.content[0]?.text;
  if (text === undefined || result.structuredContent) return result;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...result, structuredContent: parsed as Record<string, unknown> };
    }
  } catch {
    // Not JSON (for example the SPARQL update confirmation): return the text unchanged.
  }
  return result;
}

function wrapHandler<T extends Record<string, unknown>>(
  handler: (args: T) => Promise<ToolResult>,
): (args: T) => Promise<ToolResult> {
  return async (args: T): Promise<ToolResult> => {
    try {
      return withStructuredContent(await handler(args));
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
    version: SERVER_VERSION,
  });

  // --- Vocabulary tools ---

  registerReadTool(
    server,
    'list_vocabularies',
    'DEPRECATED (use resource skosmos://vocabularies; removed in 1.0). List all available vocabularies in the Skosmos instance',
    {
      lang: z.string().optional().describe('Language code for labels (e.g. "en", "fi")'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleListVocabularies(args, client, cacheManager, config)),
    outputSchemas.list_vocabularies,
  );

  registerReadTool(
    server,
    'get_vocabulary',
    'DEPRECATED (use resource skosmos://{vocid}; removed in 1.0). Get details of a specific vocabulary including top concepts',
    {
      id: z.string().min(1).describe('Vocabulary identifier (e.g. "stw", "yso")'),
      lang: z.string().optional().describe('Language code for labels'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleGetVocabulary(args, client, cacheManager, config)),
    outputSchemas.get_vocabulary,
  );

  // --- Concept tools ---

  registerReadTool(
    server,
    'get_concept',
    'DEPRECATED (use resource skosmos://{vocid}/{encodedUri}; removed in 1.0). Get full concept details including broader, narrower, and related concepts',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().optional().describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code for labels'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleGetConcept(args, client, cacheManager, config)),
    outputSchemas.get_concept,
  );

  registerReadTool(
    server,
    'get_concept_label',
    'DEPRECATED (use resource skosmos://{vocid}/{encodedUri}/labels; removed in 1.0). Get all labels (prefLabel, altLabel, hiddenLabel) for a concept URI',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleGetConceptLabel(args, client, cacheManager, config)),
    outputSchemas.get_concept_label,
  );

  registerReadTool(
    server,
    'concept_path',
    'Get the hierarchy path from a concept to its root via broader transitive relations',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleConceptPath(args, client, cacheManager, config)),
    outputSchemas.concept_path,
  );

  // --- Search tools ---

  registerReadTool(
    server,
    'search_concepts',
    'Full-text search for concepts across one or all vocabularies',
    {
      query: z.string().min(1).describe('Search query string'),
      vocabulary: z.string().optional().describe('Limit search to this vocabulary'),
      lang: z.string().optional().describe('Language code'),
      maxhits: z.number().int().positive().optional().describe('Maximum number of results'),
      offset: z.number().int().nonnegative().optional().describe('Result offset for pagination'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleSearchConcepts(args, client, cacheManager, config)),
    outputSchemas.search_concepts,
  );

  registerReadTool(
    server,
    'autocomplete',
    'Autocomplete concept labels by prefix',
    {
      prefix: z.string().min(1).describe('Label prefix to complete'),
      vocabulary: z.string().optional().describe('Limit to this vocabulary'),
      lang: z.string().optional().describe('Language code'),
      maxhits: z.number().int().positive().optional().describe('Maximum number of suggestions'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleAutocomplete(args, client, cacheManager, config)),
    outputSchemas.autocomplete,
  );

  registerReadTool(
    server,
    'resolve_label',
    'Resolve a label text to concepts in a vocabulary',
    {
      text: z.string().min(1).describe('Label text to resolve'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleResolveLabel(args, client, cacheManager, config)),
    outputSchemas.resolve_label,
  );

  // --- Labels tool ---
 
  registerReadTool(
    server,
    'labels',
    'DEPRECATED (use resource skosmos://{vocid}/{encodedUri}/labels; removed in 1.0). Get all labels for a concept URI in a vocabulary',
    {
      uri: z.string().url().describe('Concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleLabels(args, client, cacheManager, config)),
    outputSchemas.labels,
  );
 
  // --- Assistance tools ---
 
  registerReadTool(
    server,
    'vocabulary_schema_overview',
    'DEPRECATED (use resource skosmos-overview://{vocid}; removed in 1.0). Summarize a vocabulary structure with entry points, relationship hints, and suggested tasks',
    {
      id: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
      includeTopConcepts: z.boolean().optional().describe('Whether to include top concept previews'),
      maxTopConcepts: z.number().int().positive().optional().describe('Maximum number of top concepts to include'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleVocabularySchemaOverview(args, client, cacheManager, config)),
    outputSchemas.vocabulary_schema_overview,
  );
 
  registerReadTool(
    server,
    'query_guidance',
    'DEPRECATED (use prompt query_guidance; removed in 1.0). Return curated guidance for common SKOS vocabulary tasks such as exploration, label resolution, or hierarchy traversal',
    {
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      task: z
        .enum(['explore', 'resolve', 'hierarchy', 'related', 'search', 'all'])
        .optional()
        .describe('Task to tailor the guidance to'),
      lang: z.string().optional().describe('Language code'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleQueryGuidance(args, client, cacheManager, config)),
    outputSchemas.query_guidance,
  );
 
  registerReadTool(
    server,
    'reconcile_concept',
    'Resolve a label to one or more concept candidates using Skosmos lookup and search',
    {
      text: z.string().min(1).describe('Label text to resolve'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
      type: z.string().optional().describe('Optional concept type filter'),
      maxhits: z.number().int().positive().optional().describe('Maximum number of concept matches to return'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleReconcileConcept(args, client, cacheManager, config)),
    outputSchemas.reconcile_concept,
  );
 
  registerReadTool(
    server,
    'suggest_sparql_templates',
    'DEPRECATED (use resource skosmos-sparql://templates/{category}; removed in 1.0). Return SKOS-oriented SPARQL templates for exploration, hierarchy tracing, labels, and related concepts',
    {
      vocabulary: z.string().optional().describe('Optional vocabulary identifier to include in the result'),
      task: z
        .enum(['explore', 'hierarchy', 'labels', 'related', 'all'])
        .optional()
        .describe('Task category for the returned templates'),
    },
    wrapHandler(async (args) => handleSuggestSparqlTemplates(args)),
    outputSchemas.suggest_sparql_templates,
  );
 
  // --- Traversal tools ---

  registerReadTool(
    server,
    'broader_concepts',
    'DEPRECATED (use tool traverse_concepts with relationships ["broader"]; removed in 1.0). BFS traversal of broader (parent) concepts up to a specified depth',
    {
      uri: z.string().url().describe('Starting concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      depth: z.number().int().positive().optional().describe('Maximum traversal depth'),
      lang: z.string().optional().describe('Language code'),
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) =>
      handleBroaderConcepts(args, client, cacheManager, config, traversalEngine),
    ),
    outputSchemas.broader_concepts,
  );

  registerReadTool(
    server,
    'narrower_concepts',
    'DEPRECATED (use tool traverse_concepts with relationships ["narrower"]; removed in 1.0). BFS traversal of narrower (child) concepts down to a specified depth',
    {
      uri: z.string().url().describe('Starting concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      depth: z.number().int().positive().optional().describe('Maximum traversal depth'),
      lang: z.string().optional().describe('Language code'),
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) =>
      handleNarrowerConcepts(args, client, cacheManager, config, traversalEngine),
    ),
    outputSchemas.narrower_concepts,
  );

  registerReadTool(
    server,
    'related_concepts',
    'DEPRECATED (use tool traverse_concepts with relationships ["related"]; removed in 1.0). BFS traversal of related concepts up to a specified depth',
    {
      uri: z.string().url().describe('Starting concept URI'),
      vocabulary: z.string().min(1).describe('Vocabulary identifier'),
      depth: z.number().int().positive().optional().describe('Maximum traversal depth'),
      lang: z.string().optional().describe('Language code'),
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) =>
      handleRelatedConcepts(args, client, cacheManager, config, traversalEngine),
    ),
    outputSchemas.related_concepts,
  );

  registerReadTool(
    server,
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
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) =>
      handleTraverseConcepts(args, client, cacheManager, config, traversalEngine),
    ),
    outputSchemas.traverse_concepts,
  );

  // --- SPARQL tools ---

  registerReadTool(
    server,
    'execute_sparql_query',
    'Execute a SPARQL query (SELECT, CONSTRUCT, ASK, or DESCRIBE) against a SPARQL endpoint. Syntax reference and examples: resource skosmos-sparql://reference.',
    {
      query: z.string().describe('The SPARQL query to execute'),
      endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL'),
    },
    wrapHandler(async (args) =>
      handleExecuteSparqlQuery(args, config.sparqlEndpoint, config.sparqlUsername, config.sparqlPassword, config.sparqlAllowOtherEndpoints, config.userAgent),
    ),
    outputSchemas.execute_sparql_query,
  );

  registerWriteTool(
    server,
    'execute_sparql_update',
    'DESTRUCTIVE: executes a SPARQL update (INSERT, DELETE, LOAD, CLEAR, ...) against a SPARQL endpoint. Syntax reference and examples: resource skosmos-sparql://reference.',
    {
      update: z.string().describe('The SPARQL update query to execute'),
      endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL'),
    },
    wrapHandler(async (args) =>
      handleExecuteSparqlUpdate(args, config.sparqlEndpoint, config.sparqlUsername, config.sparqlPassword, config.sparqlAllowOtherEndpoints, config.userAgent),
    ),
  );

  registerReadTool(
    server,
    'list_sparql_graphs',
    'List the named graphs in a SPARQL endpoint. Graph conventions: resource skosmos-sparql://reference.',
    {
      endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL'),
    },
    wrapHandler(async (args) =>
      handleListGraphs(args, config.sparqlEndpoint, config.sparqlUsername, config.sparqlPassword, config.sparqlAllowOtherEndpoints, config.userAgent),
    ),
  );

  registerReadTool(
    server,
    'sparql_query_templates',
    'DEPRECATED (use resource skosmos-sparql://templates/{category}; removed in 1.0). Get SPARQL query templates for common SKOS exploration patterns.',
    {
      category: z
        .enum(['exploration', 'property-paths', 'statistics', 'validation', 'schema', 'all'])
        .describe('Category of templates to retrieve'),
    },
    wrapHandler(async (args) => handleSparqlTemplates(args)),
  );

  // Register resources and prompts
  registerResources(server, client, cacheManager, config);
  registerPrompts(server);

  return server;
}
