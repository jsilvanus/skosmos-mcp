// Vocabulary types
export interface ConceptScheme {
  uri: string;
  title: string;
}

export interface Vocabulary {
  id: string;
  title: string;
  defaultLanguage: string;
  languages: string[];
  conceptSchemes?: ConceptScheme[];
  type?: string[];
}

// Label types
export interface Label {
  value: string;
  lang: string;
  type: 'prefLabel' | 'altLabel' | 'hiddenLabel';
}

// Concept reference (lightweight)
export interface ConceptRef {
  uri: string;
  prefLabel?: string;
  notation?: string;
}

// Full concept
export interface Concept extends ConceptRef {
  broader: ConceptRef[];
  narrower: ConceptRef[];
  related: ConceptRef[];
  inScheme?: string[];
  altLabel?: Label[];
  definition?: Record<string, string>;
  note?: Record<string, string>;
  scopeNote?: Record<string, string>;
}

// Search result
export interface SearchResult {
  uri: string;
  prefLabel: string;
  altLabel?: string;
  type: string[];
  vocab: string;
  lang: string;
  notation?: string;
  exvocab?: string;
}

// Top concept
export interface TopConcept extends ConceptRef {
  hasChildren: boolean;
  topConceptOf?: string;
}

// Traversal types
export type TraversalRelation = 'broader' | 'narrower' | 'related' | 'mixed';

export interface TraversalNode {
  concept: ConceptRef;
  depth: number;
  relation: TraversalRelation;
  parentUri?: string;
}

export interface TraversalEdge {
  fromUri: string;
  toUri: string;
  relation: Exclude<TraversalRelation, 'mixed'>;
}

export interface TraversalResult {
  nodes: TraversalNode[];
  edges: TraversalEdge[];
  rootUri: string;
  maxDepth: number;
}

// Cache entry
export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// API response types

export interface VocabulariesResponse {
  '@context'?: Record<string, unknown>;
  vocabularies: Array<{
    id: string;
    title: string;
    defaultLanguage?: string;
    languages?: string[];
    type?: string[];
  }>;
}

export interface VocabularyInfoResponse {
  '@context'?: Record<string, unknown>;
  id: string;
  title: string;
  defaultLanguage?: string;
  languages?: string[];
  conceptSchemes?: Array<{ uri: string; title?: string; prefLabel?: Record<string, string> }>;
  type?: string[];
}

export interface TopConceptsResponse {
  '@context'?: Record<string, unknown>;
  topconcepts: Array<{
    uri: string;
    prefLabel?: string;
    notation?: string;
    hasChildren?: boolean;
    topConceptOf?: string;
  }>;
}

export interface SearchResponse {
  '@context'?: Record<string, unknown>;
  results: Array<{
    uri: string;
    prefLabel?: string;
    altLabel?: string;
    type?: string[];
    vocab?: string;
    lang?: string;
    notation?: string;
    exvocab?: string;
  }>;
}

export interface LookupResponse {
  '@context'?: Record<string, unknown>;
  results: Array<{
    uri: string;
    prefLabel?: string;
    altLabel?: string;
    type?: string[];
    vocab?: string;
    lang?: string;
    notation?: string;
  }>;
}

export interface LabelResponse {
  '@context'?: Record<string, unknown>;
  uri: string;
  prefLabel?: string;
  altLabel?: string[];
  hiddenLabel?: string[];
}

export interface BroaderResponse {
  '@context'?: Record<string, unknown>;
  uri?: string;
  broader?: Array<{ uri: string; prefLabel?: string; notation?: string }>;
  broaderTransitive?: Record<string, { uri: string; prefLabel?: string; broader?: string[] }>;
}

export interface NarrowerResponse {
  '@context'?: Record<string, unknown>;
  uri?: string;
  narrower?: Array<{ uri: string; prefLabel?: string; notation?: string }>;
  narrowerTransitive?: Record<string, { uri: string; prefLabel?: string; narrower?: string[] }>;
}

export interface RelatedResponse {
  '@context'?: Record<string, unknown>;
  uri?: string;
  related?: Array<{ uri: string; prefLabel?: string; notation?: string }>;
}

export interface HierarchyResponse {
  '@context'?: Record<string, unknown>;
  broaderTransitive?: Record<
    string,
    { uri: string; prefLabel?: string; broader?: string[]; narrower?: Array<{ uri: string; prefLabel?: string }> }
  >;
}

export interface GroupsResponse {
  '@context'?: Record<string, unknown>;
  groups?: Array<{ uri: string; prefLabel?: string; hasMembers?: boolean }>;
}

export interface GroupMembersResponse {
  '@context'?: Record<string, unknown>;
  uri?: string;
  members?: Array<{ uri: string; prefLabel?: string; notation?: string }>;
}

export interface MappingsResponse {
  '@context'?: Record<string, unknown>;
  mappings?: Array<{
    uri?: string;
    type?: string;
    from?: { memberSet?: Array<{ uri: string; prefLabel?: Record<string, string> }> };
    to?: { memberSet?: Array<{ uri: string; prefLabel?: Record<string, string> }> };
  }>;
}
