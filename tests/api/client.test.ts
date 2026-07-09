import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SkosmosClient } from '../../src/api/client.js';
import type { Config } from '../../src/config/index.js';
import { NotFoundError, ApiError, NetworkError } from '../../src/util/errors.js';

const mockConfig: Config = {
  baseUrl: 'https://skosmos.example.org',
  defaultLanguage: 'en',
  timeout: 5000,
  userAgent: 'test-agent/1.0',
  cacheTtl: 300,
  maxTraversalDepth: 3,
};

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('SkosmosClient', () => {
  let client: SkosmosClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    client = new SkosmosClient(mockConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getVocabularies', () => {
    it('calls the correct URL and returns parsed response', async () => {
      const mockData = { vocabularies: [{ id: 'yso', title: 'YSO' }] };
      fetchMock.mockResolvedValueOnce(makeResponse(mockData));

      const result = await client.getVocabularies('en');
      expect(fetchMock).toHaveBeenCalledOnce();
      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/rest/v1/vocabularies');
      expect(calledUrl).toContain('lang=en');
      expect(result).toEqual(mockData);
    });

    it('calls without lang param when not provided', async () => {
      const mockData = { vocabularies: [] };
      fetchMock.mockResolvedValueOnce(makeResponse(mockData));

      await client.getVocabularies();
      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).not.toContain('lang=');
    });
  });

  describe('retry on 5xx', () => {
    it('retries up to 3 times on 500 errors then throws', async () => {
      fetchMock.mockResolvedValue(makeResponse({ error: 'server error' }, 500));

      await expect(client.getVocabularies()).rejects.toThrow();
      // 1 initial + 3 retries = 4 calls
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('succeeds on second attempt after 5xx', async () => {
      const mockData = { vocabularies: [] };
      fetchMock
        .mockResolvedValueOnce(makeResponse({ error: 'server error' }, 500))
        .mockResolvedValueOnce(makeResponse(mockData));

      const result = await client.getVocabularies();
      expect(result).toEqual(mockData);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rethrows typed errors instead of retrying them', async () => {
      fetchMock
        .mockResolvedValueOnce(makeResponse({ error: 'server error' }, 500))
        .mockResolvedValueOnce(makeResponse({ error: 'bad request' }, 400));

      await expect(client.getVocabularies()).rejects.toBeInstanceOf(ApiError);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('timeout', () => {
    it('throws NetworkError when request times out', async () => {
      fetchMock.mockImplementation((_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = opts.signal as AbortSignal;
          signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const fastClient = new SkosmosClient({ ...mockConfig, timeout: 1 });
      await expect(fastClient.getVocabularies()).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe('error translation', () => {
    it('throws NotFoundError on 404', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ error: 'not found' }, 404));
      await expect(client.getVocabularies()).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ApiError on 400', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ error: 'bad request' }, 400));
      await expect(client.getVocabularies()).rejects.toBeInstanceOf(ApiError);
    });

    it('ApiError on 400 has statusCode 400', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ error: 'bad request' }, 400));
      const err = await client.getVocabularies().catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).statusCode).toBe(400);
    });
  });

  describe('getVocabulary', () => {
    it('encodes vocid in URL', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ id: 'yso', title: 'YSO' }));
      await client.getVocabulary('yso', 'en');
      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/yso/');
    });
  });

  describe('search', () => {
    it('passes all search params', async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ results: [] }));
      await client.search({ query: 'water', lang: 'en', maxhits: 10 });
      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('query=water');
      expect(calledUrl).toContain('lang=en');
      expect(calledUrl).toContain('maxhits=10');
    });
  });
});
