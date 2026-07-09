import type { CacheEntry } from '../models/index.js';

export class Cache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlSeconds: number) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, value: T): void {
    this.store.set(key, { data: value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

import type {
  VocabulariesResponse,
  VocabularyInfoResponse,
  LabelResponse,
  SearchResponse,
  TraversalResult,
} from '../models/index.js';

export class CacheManager {
  readonly vocabularies: Cache<VocabulariesResponse>;
  readonly vocabulary: Cache<VocabularyInfoResponse>;
  readonly labels: Cache<LabelResponse>;
  readonly search: Cache<SearchResponse>;
  readonly traversal: Cache<TraversalResult>;

  constructor(ttlSeconds: number) {
    this.vocabularies = new Cache<VocabulariesResponse>(ttlSeconds);
    this.vocabulary = new Cache<VocabularyInfoResponse>(ttlSeconds);
    this.labels = new Cache<LabelResponse>(ttlSeconds);
    this.search = new Cache<SearchResponse>(ttlSeconds);
    this.traversal = new Cache<TraversalResult>(ttlSeconds);
  }

  clearAll(): void {
    this.vocabularies.clear();
    this.vocabulary.clear();
    this.labels.clear();
    this.search.clear();
    this.traversal.clear();
  }
}
