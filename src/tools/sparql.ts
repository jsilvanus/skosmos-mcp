import { z } from 'zod';
import { SparqlClient } from '../api/sparql-client.js';
import { SparqlTemplates } from '../util/sparql-templates.js';

const ExecuteSparqlQueryInput = z.object({
  query: z.string().describe('The SPARQL query to execute (SELECT, CONSTRUCT, ASK, or DESCRIBE)'),
  endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL (overrides default)'),
});

const ExecuteSparqlUpdateInput = z.object({
  update: z.string().describe('The SPARQL update query to execute (INSERT, DELETE, or other update operations)'),
  endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL (overrides default)'),
});

const ListGraphsInput = z.object({
  endpoint: z.string().url().optional().describe('Optional custom SPARQL endpoint URL (overrides default)'),
});

const SparqlTemplatesInput = z.object({
  category: z
    .enum(['exploration', 'property-paths', 'statistics', 'validation', 'schema', 'all'])
    .describe('Category of templates to retrieve'),
});

export async function handleExecuteSparqlQuery(input: unknown, defaultEndpoint?: string, defaultUsername?: string, defaultPassword?: string) {
  const parsed = ExecuteSparqlQueryInput.parse(input);
  const endpoint = parsed.endpoint || defaultEndpoint;

  if (!endpoint) {
    throw new Error('No SPARQL endpoint configured. Set SPARQL_ENDPOINT_URL environment variable or provide endpoint parameter.');
  }

  const client = new SparqlClient(endpoint, defaultUsername || '', defaultPassword || '');
  const result = await client.executeQuery(parsed.query);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

export async function handleExecuteSparqlUpdate(input: unknown, defaultEndpoint?: string, defaultUsername?: string, defaultPassword?: string) {
  const parsed = ExecuteSparqlUpdateInput.parse(input);
  const endpoint = parsed.endpoint || defaultEndpoint;

  if (!endpoint) {
    throw new Error('No SPARQL endpoint configured. Set SPARQL_ENDPOINT_URL environment variable or provide endpoint parameter.');
  }

  const client = new SparqlClient(endpoint, defaultUsername || '', defaultPassword || '');
  const result = await client.executeUpdate(parsed.update);

  return {
    content: [
      {
        type: 'text' as const,
        text: result,
      },
    ],
  };
}

export async function handleListGraphs(input: unknown, defaultEndpoint?: string, defaultUsername?: string, defaultPassword?: string) {
  const parsed = ListGraphsInput.parse(input);
  const endpoint = parsed.endpoint || defaultEndpoint;

  if (!endpoint) {
    throw new Error('No SPARQL endpoint configured. Set SPARQL_ENDPOINT_URL environment variable or provide endpoint parameter.');
  }

  const client = new SparqlClient(endpoint, defaultUsername || '', defaultPassword || '');
  const graphs = await client.listGraphs();

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(graphs, null, 2),
      },
    ],
  };
}

export async function handleSparqlTemplates(input: unknown) {
  const parsed = SparqlTemplatesInput.parse(input);
  const templates = SparqlTemplates.getTemplates(parsed.category);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(templates, null, 2),
      },
    ],
  };
}
