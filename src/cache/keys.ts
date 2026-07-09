/**
 * Centralized cache key builder utility.
 * All cache keys include the server URL to prevent cache pollution when
 * querying different Skosmos instances via the optional server_url parameter.
 */

/**
 * Normalize a server URL for use in cache keys.
 * Uses a fixed placeholder if no URL is provided (default server).
 */
function normalizeServerUrl(serverUrl?: string): string {
  if (!serverUrl) {
    return 'default';
  }
  // Remove trailing slash and use as-is
  return serverUrl.replace(/\/$/, '');
}

export const CacheKeys = {
  /**
   * Cache key for list_vocabularies
   */
  listVocabularies: (lang?: string, serverUrl?: string): string => {
    const server = normalizeServerUrl(serverUrl);
    return `vocabularies:${server}:${lang ?? ''}`;
  },

  /**
   * Cache key for get_vocabulary
   */
  getVocabulary: (id: string, lang: string, serverUrl?: string): string => {
    const server = normalizeServerUrl(serverUrl);
    return `vocabulary:${server}:${id}:${lang}`;
  },

  /**
   * Cache key for get_concept_label and labels
   */
  conceptLabel: (uri: string, vocabulary: string, lang: string, serverUrl?: string): string => {
    const server = normalizeServerUrl(serverUrl);
    return `label:${server}:${vocabulary}:${uri}:${lang}`;
  },

  /**
   * Cache key for search_concepts
   */
  searchConcepts: (
    query: string,
    vocabulary: string | undefined,
    lang: string,
    maxhits?: number,
    offset?: number,
    serverUrl?: string,
  ): string => {
    const server = normalizeServerUrl(serverUrl);
    const vocab = vocabulary ?? '';
    const max = maxhits ?? '';
    const off = offset ?? '';
    return `search:${server}:${vocab}:${query}:${lang}:${max}:${off}`;
  },

  /**
   * Cache key for autocomplete
   */
  autocomplete: (
    prefix: string,
    vocabulary: string | undefined,
    lang: string,
    maxhits?: number,
    serverUrl?: string,
  ): string => {
    const server = normalizeServerUrl(serverUrl);
    const vocab = vocabulary ?? '';
    const max = maxhits ?? '';
    return `autocomplete:${server}:${vocab}:${prefix}:${lang}:${max}`;
  },

  /**
   * Cache key for resolve_label
   */
  resolveLabel: (text: string, vocabulary: string, lang: string, serverUrl?: string): string => {
    const server = normalizeServerUrl(serverUrl);
    return `resolve_label:${server}:${vocabulary}:${text}:${lang}`;
  },

  /**
   * Cache key for broader_concepts, narrower_concepts, related_concepts, traverse_concepts
   */
  traversal: (
    uri: string,
    vocabulary: string,
    traversalType: 'broader' | 'narrower' | 'related' | 'traverse',
    lang: string,
    depth?: number,
    relationships?: string[],
    serverUrl?: string,
  ): string => {
    const server = normalizeServerUrl(serverUrl);
    const d = depth ?? '';
    const rel = relationships?.join(',') ?? '';
    return `traversal:${server}:${traversalType}:${uri}:${vocabulary}:${lang}:${d}:${rel}`;
  },
};
