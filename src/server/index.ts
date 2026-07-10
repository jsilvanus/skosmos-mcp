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
    {
      lang: z.string().optional().describe('Language code for labels (e.g. "en", "fi")'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleListVocabularies(args, client, cacheManager, config)),
  );

  server.tool(
    'get_vocabulary',
    'Get details of a specific vocabulary including top concepts',
    {
      id: z.string().min(1).describe('Vocabulary identifier (e.g. "stw", "yso")'),
      lang: z.string().optional().describe('Language code for labels'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleLabels(args, client, cacheManager, config)),
  );
 
  // --- Assistance tools ---
 
  server.tool(
    'vocabulary_schema_overview',
    'Summarize a vocabulary structure with entry points, relationship hints, and suggested tasks',
    {
      id: z.string().min(1).describe('Vocabulary identifier'),
      lang: z.string().optional().describe('Language code'),
      includeTopConcepts: z.boolean().optional().describe('Whether to include top concept previews'),
      maxTopConcepts: z.number().int().positive().optional().describe('Maximum number of top concepts to include'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) => handleVocabularySchemaOverview(args, client, cacheManager, config)),
  );
 
  server.tool(
    'query_guidance',
    'Return curated guidance for common SKOS vocabulary tasks such as exploration, label resolution, or hierarchy traversal',
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
  );
 
  server.tool(
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
  );
 
  server.tool(
    'suggest_sparql_templates',
    'Return SKOS-oriented SPARQL templates for exploration, hierarchy tracing, labels, and related concepts',
    {
      vocabulary: z.string().optional().describe('Optional vocabulary identifier to include in the result'),
      task: z
        .enum(['explore', 'hierarchy', 'labels', 'related', 'all'])
        .optional()
        .describe('Task category for the returned templates'),
    },
    wrapHandler(async (args) => handleSuggestSparqlTemplates(args)),
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
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
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
      include_explanation: z.boolean().optional().describe('Whether to include a short explanation of the traversal result'),
      server_url: z.string().url().optional().describe('Optional Skosmos server URL (if enabled)'),
    },
    wrapHandler(async (args) =>
      handleTraverseConcepts(args, client, cacheManager, config, traversalEngine),
    ),
  );

  // --- SPARQL tools ---

  server.tool(
    'execute_sparql_query',
    `Execute a SPARQL query against a SPARQL endpoint (SELECT, CONSTRUCT, ASK, or DESCRIBE).

SPARQL (SPARQL Protocol and RDF Query Language) is a query language for RDF data.

Key SPARQL Query Forms:
- SELECT: Returns variable bindings as a table
- CONSTRUCT: Returns RDF triples
- ASK: Returns true/false
- DESCRIBE: Returns RDF description of resources

Basic SPARQL Syntax:
- PREFIX declarations: PREFIX ex: <http://example.org/>
- WHERE clause with triple patterns: ?subject ?predicate ?object
- Optional patterns: OPTIONAL { ?s ?p ?o }
- Filters: FILTER(?var > 10)
- Graph patterns: GRAPH <uri> { ?s ?p ?o }
- Property paths: ?s ex:knows/ex:friend ?o (sequence), ?s ex:knows* ?o (zero or more)

Common Query Templates:
1. Basic exploration: SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10
2. Count triples: SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }
3. List types: SELECT DISTINCT ?type WHERE { ?s a ?type }
4. Property path: SELECT ?person ?friend WHERE { ?person foaf:knows/foaf:knows ?friend }
5. Optional properties: SELECT ?s ?name WHERE { ?s a ex:Person . OPTIONAL { ?s foaf:name ?name } }
6. Named graph query: SELECT ?s ?p ?o FROM NAMED <graph> WHERE { GRAPH <graph> { ?s ?p ?o } }
7. Filter by value: SELECT ?s WHERE { ?s ex:age ?age . FILTER(?age > 18) }

Property Path Operators:
- / (sequence): ?s foaf:knows/foaf:name ?name
- | (alternative): ?s (foaf:name|rdfs:label) ?name
- * (zero or more): ?s foaf:knows* ?connected
- + (one or more): ?s ex:partOf+ ?container
- ? (zero or one): ?s foaf:knows? ?maybeKnown
- ^ (inverse): ?s ^ex:hasChild ?parent
- ! (negation): ?s !(rdf:type) ?notType`,
    {
      query: z.string().describe('The SPARQL query to execute'),
      endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL'),
    },
    wrapHandler(async (args) =>
      handleExecuteSparqlQuery(args, config.sparqlEndpoint, config.sparqlUsername, config.sparqlPassword, config.sparqlAllowOtherEndpoints),
    ),
  );

  server.tool(
    'execute_sparql_update',
    `Execute a SPARQL update query against a SPARQL endpoint.

SPARQL Update Operations:
- INSERT DATA: Add triples to the dataset
- DELETE DATA: Remove specific triples
- INSERT/DELETE WHERE: Conditional insert/delete based on patterns
- LOAD/CLEAR: Load/clear entire graphs
- CREATE/DROP: Manage graph lifecycle

Basic Update Syntax:
- INSERT DATA { <subject> <predicate> <object> }
- DELETE DATA { <subject> <predicate> <object> }
- INSERT { ?s <new:prop> "value" } WHERE { ?s <old:prop> ?o }
- DELETE { ?s <old:prop> ?o } WHERE { ?s <old:prop> ?o }
- CLEAR GRAPH <graph-uri>

Example Updates:
1. Insert data: INSERT DATA { <ex:person1> foaf:name "John" ; ex:age 25 }
2. Delete data: DELETE DATA { <ex:person1> ex:age 25 }
3. Conditional update: DELETE { ?p ex:status "pending" } INSERT { ?p ex:status "active" } WHERE { ?p ex:status "pending" }
4. Insert with graph: INSERT DATA { GRAPH <ex:metadata> { <ex:dataset1> dcterms:created "2024-01-01"^^xsd:date } }
5. Clear graph: CLEAR GRAPH <ex:temporary>`,
    {
      update: z.string().describe('The SPARQL update query to execute'),
      endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL'),
    },
    wrapHandler(async (args) =>
      handleExecuteSparqlUpdate(args, config.sparqlEndpoint, config.sparqlUsername, config.sparqlPassword, config.sparqlAllowOtherEndpoints),
    ),
  );

  server.tool(
    'list_sparql_graphs',
    `List all available named graphs in a SPARQL endpoint.

Named graphs in RDF provide context and provenance for triples. Each graph is identified by a URI.

Common Graph Patterns:
- Default graph (unnamed): Contains triples not in any specific graph
- Named graphs: <http://example.org/graph1>, <http://data.gov/dataset1>
- Metadata graphs: Often contain information about other graphs
- Versioned graphs: <http://data.org/v1>, <http://data.org/v2>

Use Cases:
- Data provenance: Track where data came from
- Temporal data: Different time periods in separate graphs
- Access control: Different permissions per graph
- Data quality: Separate validated vs raw data`,
    {
      endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL'),
    },
    wrapHandler(async (args) =>
      handleListGraphs(args, config.sparqlEndpoint, config.sparqlUsername, config.sparqlPassword, config.sparqlAllowOtherEndpoints),
    ),
  );

  server.tool(
    'sparql_query_templates',
    `Get SPARQL query templates for common knowledge graph exploration patterns.

This tool provides pre-built SPARQL query templates covering:
- Basic data exploration and statistics
- Property path navigation for complex relationships
- Knowledge graph analysis patterns
- Data validation and quality checks
- Schema discovery and documentation

Templates include explanations and can be customized with your specific URIs and requirements.`,
    {
      category: z
        .enum(['exploration', 'property-paths', 'statistics', 'validation', 'schema', 'all'])
        .describe('Category of templates to retrieve'),
    },
    wrapHandler(async (args) => handleSparqlTemplates(args)),
  );

  // Register resources
  registerResources(server, client, cacheManager, config);

  return server;
}
