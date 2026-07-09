import type { Config } from '../config/index.js';
import { NetworkError, translateHttpError } from '../util/errors.js';
import { logger } from '../util/logger.js';
import type {
  VocabulariesResponse,
  VocabularyInfoResponse,
  TopConceptsResponse,
  SearchResponse,
  LookupResponse,
  LabelResponse,
  BroaderResponse,
  NarrowerResponse,
  RelatedResponse,
  HierarchyResponse,
  GroupsResponse,
  GroupMembersResponse,
  MappingsResponse,
} from '../models/index.js';

export interface SearchParams {
  query: string;
  lang?: string;
  labellang?: string;
  vocab?: string;
  type?: string;
  parent?: string;
  group?: string;
  maxhits?: number;
  offset?: number;
  fields?: string;
  unique?: boolean;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status < 600;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SkosmosClient {
  private readonly baseUrl: string;
  private readonly config: Config;

  constructor(config: Config, baseUrl?: string) {
    this.config = config;
    const urlToUse = baseUrl ?? config.baseUrl;
    this.baseUrl = urlToUse.replace(/\/$/, '') + '/rest/v1';
  }

  withBaseUrl(baseUrl: string): SkosmosClient {
    return new SkosmosClient(this.config, baseUrl);
  }

  private buildUrl(path: string, params: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async fetchWithRetry<T>(url: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        logger.debug('Fetching URL', { url, attempt });
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': this.config.userAgent,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          const err = translateHttpError(response.status, body, url);
          if (!isRetryableStatus(response.status)) {
            throw err;
          }
          lastError = err;
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
            logger.warn('Retrying request', { url, attempt, status: response.status, delay });
            await sleep(delay);
            continue;
          }
          throw lastError;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json') && !contentType.includes('application/ld+json')) {
          logger.warn('Unexpected content type', { url, contentType });
        }

        return (await response.json()) as T;
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof Error && err.name === 'AbortError') {
          throw new NetworkError(`Request timed out after ${this.config.timeout}ms: ${url}`);
        }

        const isTypedError =
          err instanceof Error &&
          (err.name === 'NotFoundError' || err.name === 'ApiError' || err.name === 'InvalidVocabularyError');
        if (isTypedError) {
          throw err;
        }

        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          logger.warn('Retrying after error', { url, attempt, error: lastError.message, delay });
          await sleep(delay);
        }
      }
    }

    if (lastError instanceof Error && lastError.name !== 'NetworkError') {
      throw lastError;
    }

    throw new NetworkError(`Request failed after ${MAX_RETRIES} retries: ${url}`, lastError);
  }

  async getVocabularies(lang?: string): Promise<VocabulariesResponse> {
    const url = this.buildUrl('/vocabularies', { lang });
    return this.fetchWithRetry<VocabulariesResponse>(url);
  }

  async getVocabulary(vocid: string, lang?: string): Promise<VocabularyInfoResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/`, { lang });
    return this.fetchWithRetry<VocabularyInfoResponse>(url);
  }

  async getTopConcepts(vocid: string, lang?: string, scheme?: string): Promise<TopConceptsResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/topConcepts`, { lang, scheme });
    return this.fetchWithRetry<TopConceptsResponse>(url);
  }

  async search(params: SearchParams): Promise<SearchResponse> {
    const url = this.buildUrl('/search', {
      query: params.query,
      lang: params.lang,
      labellang: params.labellang,
      vocab: params.vocab,
      type: params.type,
      parent: params.parent,
      group: params.group,
      maxhits: params.maxhits,
      offset: params.offset,
      fields: params.fields,
      unique: params.unique,
    });
    return this.fetchWithRetry<SearchResponse>(url);
  }

  async searchInVocabulary(vocid: string, params: SearchParams): Promise<SearchResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/search`, {
      query: params.query,
      lang: params.lang,
      type: params.type,
      parent: params.parent,
      group: params.group,
      maxhits: params.maxhits,
      offset: params.offset,
      fields: params.fields,
      unique: params.unique,
    });
    return this.fetchWithRetry<SearchResponse>(url);
  }

  async lookup(vocid: string, label: string, lang?: string): Promise<LookupResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/lookup`, { label, lang });
    return this.fetchWithRetry<LookupResponse>(url);
  }

  async lookupLabel(uri: string, lang?: string): Promise<LabelResponse> {
    const url = this.buildUrl('/label', { uri, lang });
    return this.fetchWithRetry<LabelResponse>(url);
  }

  async getConceptLabel(vocid: string, uri: string, lang?: string): Promise<LabelResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/label`, { uri, lang });
    return this.fetchWithRetry<LabelResponse>(url);
  }

  async getBroader(vocid: string, uri: string, lang?: string): Promise<BroaderResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/broader`, { uri, lang });
    return this.fetchWithRetry<BroaderResponse>(url);
  }

  async getBroaderTransitive(
    vocid: string,
    uri: string,
    lang?: string,
    limit?: number,
  ): Promise<BroaderResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/broaderTransitive`, { uri, lang, limit });
    return this.fetchWithRetry<BroaderResponse>(url);
  }

  async getNarrower(vocid: string, uri: string, lang?: string): Promise<NarrowerResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/narrower`, { uri, lang });
    return this.fetchWithRetry<NarrowerResponse>(url);
  }

  async getNarrowerTransitive(
    vocid: string,
    uri: string,
    lang?: string,
    limit?: number,
  ): Promise<NarrowerResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/narrowerTransitive`, {
      uri,
      lang,
      limit,
    });
    return this.fetchWithRetry<NarrowerResponse>(url);
  }

  async getRelated(vocid: string, uri: string, lang?: string): Promise<RelatedResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/related`, { uri, lang });
    return this.fetchWithRetry<RelatedResponse>(url);
  }

  async getChildren(vocid: string, uri: string, lang?: string): Promise<NarrowerResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/children`, { uri, lang });
    return this.fetchWithRetry<NarrowerResponse>(url);
  }

  async getHierarchy(vocid: string, uri: string, lang?: string): Promise<HierarchyResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/hierarchy`, { uri, lang });
    return this.fetchWithRetry<HierarchyResponse>(url);
  }

  async getGroups(vocid: string, lang?: string): Promise<GroupsResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/groups`, { lang });
    return this.fetchWithRetry<GroupsResponse>(url);
  }

  async getGroupMembers(vocid: string, uri: string, lang?: string): Promise<GroupMembersResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/groupMembers`, { uri, lang });
    return this.fetchWithRetry<GroupMembersResponse>(url);
  }

  async getMappings(vocid: string, uri: string, lang?: string): Promise<MappingsResponse> {
    const url = this.buildUrl(`/${encodeURIComponent(vocid)}/mappings`, { uri, lang });
    return this.fetchWithRetry<MappingsResponse>(url);
  }
}
