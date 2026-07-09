/**
 * SPARQL query templates for common data exploration patterns.
 * Contains code derived from ramuzes/mcp-jena (https://github.com/ramuzes/mcp-jena)
 * Used under MIT License.
 */
export interface QueryTemplate {
  name: string;
  description: string;
  query: string;
  variables?: string[];
  explanation?: string;
}

export interface TemplateCategory {
  category: string;
  description: string;
  templates: QueryTemplate[];
}

export class SparqlTemplates {
  private static explorationTemplates: QueryTemplate[] = [
    {
      name: 'basic_exploration',
      description: 'Basic exploration of all triples in the dataset',
      query: 'SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object } LIMIT 10',
      variables: ['subject', 'predicate', 'object'],
      explanation: 'Returns the first 10 triples to get a sense of the data structure',
    },
    {
      name: 'count_all_triples',
      description: 'Count total number of triples in the dataset',
      query: 'SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }',
      variables: ['count'],
      explanation: 'Provides total triple count for dataset size estimation',
    },
    {
      name: 'list_all_types',
      description: 'List all rdf:type values (classes) in the dataset',
      query: 'SELECT DISTINCT ?type (COUNT(?instance) as ?count) WHERE { ?instance a ?type } GROUP BY ?type ORDER BY DESC(?count)',
      variables: ['type', 'count'],
      explanation: 'Shows what types of entities exist and their frequency',
    },
    {
      name: 'list_all_properties',
      description: 'List all properties used in the dataset',
      query: 'SELECT DISTINCT ?property (COUNT(?usage) as ?count) WHERE { ?s ?property ?o } GROUP BY ?property ORDER BY DESC(?count)',
      variables: ['property', 'count'],
      explanation: 'Shows what properties are used and how frequently',
    },
  ];

  private static propertyPathTemplates: QueryTemplate[] = [
    {
      name: 'friends_of_friends',
      description: 'Find friends of friends using property paths',
      query: `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?person ?friend_of_friend WHERE {
  ?person foaf:knows/foaf:knows ?friend_of_friend .
  FILTER(?person != ?friend_of_friend)
}`,
      variables: ['person', 'friend_of_friend'],
      explanation: 'Uses sequence path (/) to find connections two steps away',
    },
    {
      name: 'all_connected_people',
      description: 'Find all people connected through knows relationships',
      query: `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?person ?connected WHERE {
  ?person foaf:knows* ?connected .
  FILTER(?person != ?connected)
}`,
      variables: ['person', 'connected'],
      explanation: 'Uses zero-or-more path (*) to find all transitive connections',
    },
    {
      name: 'alternative_names',
      description: 'Find entities with alternative name properties',
      query: `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?entity ?name WHERE {
  ?entity (foaf:name|rdfs:label|foaf:nick) ?name
}`,
      variables: ['entity', 'name'],
      explanation: 'Uses alternative path (|) to find any of several name properties',
    },
    {
      name: 'inverse_relationships',
      description: 'Find parent-child relationships using inverse paths',
      query: `PREFIX ex: <http://example.org/>
SELECT ?parent ?child WHERE {
  ?child ^ex:hasParent ?parent
}`,
      variables: ['parent', 'child'],
      explanation: 'Uses inverse path (^) where ?parent ex:hasParent ?child',
    },
  ];

  private static statisticsTemplates: QueryTemplate[] = [
    {
      name: 'graph_statistics',
      description: 'Basic statistics about each named graph',
      query: `SELECT ?graph (COUNT(*) as ?triples) WHERE {
  GRAPH ?graph { ?s ?p ?o }
} GROUP BY ?graph ORDER BY DESC(?triples)`,
      variables: ['graph', 'triples'],
      explanation: 'Shows triple count per named graph',
    },
    {
      name: 'property_usage_stats',
      description: 'Statistics about property usage patterns',
      query: `SELECT ?property 
  (COUNT(DISTINCT ?subject) as ?unique_subjects)
  (COUNT(DISTINCT ?object) as ?unique_objects)
  (COUNT(*) as ?total_usage)
WHERE {
  ?subject ?property ?object
} GROUP BY ?property ORDER BY DESC(?total_usage)`,
      variables: ['property', 'unique_subjects', 'unique_objects', 'total_usage'],
      explanation: 'Detailed usage statistics for each property',
    },
    {
      name: 'literal_type_distribution',
      description: 'Distribution of literal datatypes',
      query: `SELECT ?datatype (COUNT(?literal) as ?count) WHERE {
  ?s ?p ?literal .
  FILTER(isLiteral(?literal))
  BIND(DATATYPE(?literal) as ?datatype)
} GROUP BY ?datatype ORDER BY DESC(?count)`,
      variables: ['datatype', 'count'],
      explanation: 'Shows what datatypes are used for literal values',
    },
  ];

  private static validationTemplates: QueryTemplate[] = [
    {
      name: 'missing_labels',
      description: 'Find entities without human-readable labels',
      query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?entity WHERE {
  ?entity a ?type .
  FILTER NOT EXISTS { ?entity rdfs:label ?label }
  FILTER NOT EXISTS { ?entity foaf:name ?name }
  FILTER(isURI(?entity))
} LIMIT 20`,
      variables: ['entity'],
      explanation: 'Identifies entities that lack human-readable names',
    },
    {
      name: 'orphaned_nodes',
      description: 'Find nodes with no incoming or outgoing connections',
      query: `SELECT ?node WHERE {
  ?node a ?type .
  FILTER NOT EXISTS { ?node ?p ?o }
  FILTER NOT EXISTS { ?s ?p ?node }
}`,
      variables: ['node'],
      explanation: 'Finds isolated nodes that aren\'t connected to anything',
    },
    {
      name: 'duplicate_labels',
      description: 'Find entities with identical labels',
      query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?label (COUNT(?entity) as ?count) WHERE {
  ?entity rdfs:label ?label
} GROUP BY ?label HAVING(?count > 1) ORDER BY DESC(?count)`,
      variables: ['label', 'count'],
      explanation: 'Identifies potential duplicate entities with same labels',
    },
  ];

  private static schemaTemplates: QueryTemplate[] = [
    {
      name: 'class_hierarchy',
      description: 'Discover class hierarchy using rdfs:subClassOf',
      query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?subclass ?superclass WHERE {
  ?subclass rdfs:subClassOf+ ?superclass
} ORDER BY ?superclass ?subclass`,
      variables: ['subclass', 'superclass'],
      explanation: 'Shows the complete class hierarchy in the dataset',
    },
    {
      name: 'property_domains_ranges',
      description: 'Find domains and ranges of properties',
      query: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?property ?domain ?range WHERE {
  OPTIONAL { ?property rdfs:domain ?domain }
  OPTIONAL { ?property rdfs:range ?range }
  FILTER EXISTS { ?s ?property ?o }
} ORDER BY ?property`,
      variables: ['property', 'domain', 'range'],
      explanation: 'Documents the expected types for property subjects and objects',
    },
    {
      name: 'inferred_property_types',
      description: 'Infer property domains and ranges from usage',
      query: `SELECT ?property 
  (GROUP_CONCAT(DISTINCT ?subject_type; separator=", ") as ?inferred_domains)
  (GROUP_CONCAT(DISTINCT ?object_type; separator=", ") as ?inferred_ranges)
WHERE {
  ?subject ?property ?object .
  OPTIONAL { ?subject a ?subject_type }
  OPTIONAL { ?object a ?object_type }
  FILTER(BOUND(?subject_type) || BOUND(?object_type))
} GROUP BY ?property`,
      variables: ['property', 'inferred_domains', 'inferred_ranges'],
      explanation: 'Discovers actual usage patterns for properties',
    },
  ];

  static getTemplates(category: string): TemplateCategory | TemplateCategory[] {
    const categories: Record<string, TemplateCategory> = {
      exploration: {
        category: 'exploration',
        description: 'Basic data discovery and statistics',
        templates: this.explorationTemplates,
      },
      'property-paths': {
        category: 'property-paths',
        description: 'Complex graph navigation patterns using SPARQL property paths',
        templates: this.propertyPathTemplates,
      },
      statistics: {
        category: 'statistics',
        description: 'Knowledge graph analysis and metrics',
        templates: this.statisticsTemplates,
      },
      validation: {
        category: 'validation',
        description: 'Data quality and consistency checks',
        templates: this.validationTemplates,
      },
      schema: {
        category: 'schema',
        description: 'Structure discovery and documentation',
        templates: this.schemaTemplates,
      },
    };

    if (category === 'all') {
      return Object.values(categories);
    }

    if (category in categories) {
      return categories[category] as TemplateCategory;
    }

    // Return error template for unknown category
    const validCategories = Object.keys(categories).join(', ');
    return {
      category: 'error',
      description: `Unknown template category: ${category}. Valid categories are: ${validCategories}, or 'all'`,
      templates: [],
    };
  }
}
