import { z } from 'zod';
import type { SkosmosClient } from '../api/client.js';
import type { CacheManager } from '../cache/index.js';
import type { Config } from '../config/index.js';
import { getClient } from './utils.js';

const LOOKUP_BASE_SCORE = 100;
const LOOKUP_SCORE_DECAY = 2;
const LOOKUP_MIN_SCORE = 60;
const SEARCH_BASE_SCORE = 80;
const SEARCH_SCORE_DECAY = 2;
const SEARCH_MIN_SCORE = 40;

export const vocabularySchemaOverviewSchema = z.object({
  id: z.string().min(1),
  lang: z.string().optional(),
  includeTopConcepts: z.boolean().optional(),
  maxTopConcepts: z.number().int().positive().optional(),
  server_url: z.string().url().optional(),
});

export const queryGuidanceSchema = z.object({
  vocabulary: z.string().min(1),
  task: z.enum(['explore', 'resolve', 'hierarchy', 'related', 'search', 'all']).optional(),
  lang: z.string().optional(),
  server_url: z.string().url().optional(),
});

export const reconcileConceptSchema = z.object({
  text: z.string().min(1),
  vocabulary: z.string().min(1),
  lang: z.string().optional(),
  type: z.string().optional(),
  maxhits: z.number().int().positive().optional(),
  server_url: z.string().url().optional(),
});

export const suggestSparqlTemplatesSchema = z.object({
  vocabulary: z.string().optional(),
  task: z.enum(['explore', 'hierarchy', 'labels', 'related', 'all']).optional(),
});

function buildTaskGuidance(vocabulary: string, selectedTask?: string) {
  const tasks = [
    {
      task: 'explore',
      title: 'Explore vocabulary entry points',
      description: 'Start by inspecting top concepts and vocabulary metadata.',
      recommendedTools: ['get_vocabulary', 'list_vocabularies', 'search_concepts'],
      starterPattern: 'Use get_vocabulary to inspect the vocabulary and top concepts before composing a query.',
    },
    {
      task: 'resolve',
      title: 'Resolve a label to a concept',
      description: 'Resolve an input label to a canonical concept URI before traversing or querying.',
      recommendedTools: ['resolve_label', 'reconcile_concept'],
      starterPattern: 'Use reconcile_concept or resolve_label to turn a label into a concept URI.',
    },
    {
      task: 'hierarchy',
      title: 'Trace broader and narrower relationships',
      description: 'Inspect hierarchy structure around a concept to understand parent/child context.',
      recommendedTools: ['broader_concepts', 'narrower_concepts', 'concept_path'],
      starterPattern: 'Use broader_concepts or narrower_concepts to inspect the local hierarchy.',
    },
    {
      task: 'related',
      title: 'Inspect related concepts',
      description: 'Explore semantically related concepts around a starting point.',
      recommendedTools: ['related_concepts', 'traverse_concepts'],
      starterPattern: 'Use related_concepts to expand around a concept without changing the vocabulary context.',
    },
    {
      task: 'search',
      title: 'Search for candidate concepts',
      description: 'Search the vocabulary for candidate labels or terms before detailed inspection.',
      recommendedTools: ['search_concepts', 'autocomplete'],
      starterPattern: 'Use search_concepts or autocomplete to find likely matches and refine the query.',
    },
  ];

  if (selectedTask && selectedTask !== 'all') {
    return tasks.filter((item) => item.task === selectedTask);
  }

  return tasks;
}

export async function handleVocabularySchemaOverview(
  args: z.infer<typeof vocabularySchemaOverviewSchema>,
  client: SkosmosClient,
  _cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const activeClient = getClient(client, config, args.server_url);
  const [vocabulary, topConceptsResponse] = await Promise.all([
    activeClient.getVocabulary(args.id, lang),
    activeClient.getTopConcepts(args.id, lang),
  ]);

  const topConcepts = topConceptsResponse.topconcepts ?? [];
  const limitedTopConcepts = (args.includeTopConcepts === false
    ? []
    : topConcepts.slice(0, args.maxTopConcepts ?? 8)).map((concept) => ({
    uri: concept.uri,
    prefLabel: concept.prefLabel,
    hasChildren: concept.hasChildren,
  }));

  const result = {
    vocabulary: {
      id: vocabulary.id,
      title: vocabulary.title,
      defaultLanguage: vocabulary.defaultLanguage,
      languages: vocabulary.languages,
      type: vocabulary.type,
    },
    overview: {
      summary: `Vocabulary ${vocabulary.title} exposes ${topConcepts.length} top concepts and supports SKOS-style browsing.`,
      topConceptCount: topConcepts.length,
      topConcepts: limitedTopConcepts,
      relationshipHints: ['broader', 'narrower', 'related'],
      suggestedTasks: [
        {
          title: 'Inspect hierarchy entry points',
          reason: 'Top concepts are the best place to start when a client needs a high-level vocabulary map.',
        },
        {
          title: 'Resolve labels to concepts',
          reason: 'Use the label resolution tools when a user asks about a specific term or entity.',
        },
        {
          title: 'Traverse a concept neighborhood',
          reason: 'Broader, narrower, and related relations are the primary way to explore concept context.',
        },
      ],
    },
  };

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleQueryGuidance(
  args: z.infer<typeof queryGuidanceSchema>,
  _client: SkosmosClient,
  _cache: CacheManager,
  _config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const guidance = buildTaskGuidance(args.vocabulary, args.task);
  const result = {
    vocabulary: args.vocabulary,
    task: args.task ?? 'all',
    guidance,
  };

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleReconcileConcept(
  args: z.infer<typeof reconcileConceptSchema>,
  client: SkosmosClient,
  _cache: CacheManager,
  config: Config,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const lang = args.lang ?? config.defaultLanguage;
  const activeClient = getClient(client, config, args.server_url);
  const lookupResponse = await activeClient.lookup(args.vocabulary, args.text, lang);
  const lookupMatches = (lookupResponse.results ?? []).map((result, index) => ({
    ...result,
    // Lookup results are ranked slightly more confidently than search results because
    // they come from the vocabulary's dedicated label resolution endpoint.
    score: Math.max(LOOKUP_BASE_SCORE - index * LOOKUP_SCORE_DECAY, LOOKUP_MIN_SCORE),
    matchedBy: 'lookup',
  }));

  let matches = lookupMatches;
  if (matches.length === 0) {
    const searchResponse = await activeClient.searchInVocabulary(args.vocabulary, {
      query: args.text,
      lang,
      ...(args.type ? { type: args.type } : {}),
      maxhits: args.maxhits ?? 5,
    });
    matches = (searchResponse.results ?? []).map((result, index) => ({
      ...result,
      // Search results are scored slightly lower because they are a broader fallback
      // and may be less precise than a dedicated lookup match.
      score: Math.max(SEARCH_BASE_SCORE - index * SEARCH_SCORE_DECAY, SEARCH_MIN_SCORE),
      matchedBy: 'search',
    }));
  }

  const result = {
    text: args.text,
    vocabulary: args.vocabulary,
    lang,
    requestedType: args.type,
    matchCount: matches.length,
    matches,
  };

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}

export async function handleSuggestSparqlTemplates(
  args: z.infer<typeof suggestSparqlTemplatesSchema>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const task = args.task ?? 'all';
  const templates = [
    {
      task: 'explore',
      name: 'List top concepts',
      description: 'Inspect the vocabulary entry points before asking more specific questions.',
      sparql: `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label
WHERE {
  ?concept a skos:Concept ;
           skos:prefLabel ?label .
}
LIMIT 20`,
    },
    {
      task: 'hierarchy',
      name: 'Trace broader/narrower relations',
      description: 'Show the local hierarchy around a specific concept.',
      sparql: `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?related ?label
WHERE {
  <http://example.org/concept> skos:broader|skos:narrower ?related .
  ?related skos:prefLabel ?label .
}
LIMIT 20`,
    },
    {
      task: 'labels',
      name: 'Fetch labels for a concept',
      description: 'Return prefLabels and altLabels for a specific concept.',
      sparql: `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?label ?type
WHERE {
  <http://example.org/concept> ?predicate ?label .
  FILTER(?predicate IN (skos:prefLabel, skos:altLabel, skos:hiddenLabel))
  BIND(?predicate AS ?type)
}
LIMIT 20`,
    },
    {
      task: 'related',
      name: 'Find related concepts',
      description: 'Inspect semantically related concepts around a concept.',
      sparql: `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?related ?label
WHERE {
  <http://example.org/concept> skos:related ?related .
  ?related skos:prefLabel ?label .
}
LIMIT 20`,
    },
  ];

  const filteredTemplates = task === 'all' ? templates : templates.filter((template) => template.task === task);

  const result = {
    vocabulary: args.vocabulary,
    task,
    templates: filteredTemplates,
  };

  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
}
