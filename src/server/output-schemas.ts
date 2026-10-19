import { z } from 'zod';
import type { ZodRawShape } from 'zod';

/**
 * Output schemas for tools that return a JSON object. Each one is sent as structuredContent next to the
 * text content, so clients can parse results without guessing the shape.
 *
 * Fields that come unchanged from the Skosmos or SPARQL endpoint are optional and loosely typed: the
 * schema names the fields this server relies on, not every field an endpoint may send.
 *
 * Tools without an entry (list_sparql_graphs, sparql_query_templates, execute_sparql_update) either
 * return a JSON array or plain text, which MCP structuredContent cannot represent as an object.
 */
const record = z.record(z.unknown());

export const outputSchemas = {
  list_vocabularies: {
    vocabularies: z.array(record),
  },
  get_vocabulary: {
    vocabulary: record,
    topConcepts: z.array(z.unknown()),
  },
  get_concept: {
    uri: z.string(),
    prefLabel: z.string().optional(),
    altLabel: z.array(z.string()).optional(),
    broader: z.array(record),
    narrower: z.array(record),
    related: z.array(record),
  },
  get_concept_label: {
    uri: z.string().optional(),
    prefLabel: z.string().optional(),
    altLabel: z.array(z.string()).optional(),
    hiddenLabel: z.array(z.string()).optional(),
  },
  labels: {
    uri: z.string().optional(),
    prefLabel: z.string().optional(),
    altLabel: z.array(z.string()).optional(),
    hiddenLabel: z.array(z.string()).optional(),
  },
  concept_path: {
    uri: z.string().optional(),
  },
  search_concepts: {
    results: z.array(record).optional(),
  },
  autocomplete: {
    results: z.array(record).optional(),
  },
  resolve_label: {
    results: z.array(record).optional(),
  },
  reconcile_concept: {
    text: z.string(),
    vocabulary: z.string(),
    lang: z.string(),
    requestedType: z.string().optional(),
    matchCount: z.number(),
    matches: z.array(record),
  },
  vocabulary_schema_overview: {
    vocabulary: record,
    overview: record,
  },
  query_guidance: {
    vocabulary: z.string(),
    task: z.string(),
    guidance: z.unknown(),
  },
  suggest_sparql_templates: {
    vocabulary: z.string().optional(),
    task: z.string(),
    templates: z.array(record),
  },
  broader_concepts: traversalShape(),
  narrower_concepts: traversalShape(),
  related_concepts: traversalShape(),
  traverse_concepts: traversalShape(),
  execute_sparql_query: {
    head: z.object({ vars: z.array(z.string()).optional() }).optional(),
    results: record.optional(),
    boolean: z.boolean().optional(),
  },
} satisfies Record<string, ZodRawShape>;

function traversalShape(): ZodRawShape {
  return {
    nodes: z.array(record),
    edges: z.array(record),
    rootUri: z.string(),
    maxDepth: z.number(),
    explanation: z.unknown().optional(),
  };
}
