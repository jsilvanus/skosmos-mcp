import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { SparqlClient } from '../../src/api/sparql-client.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    isAxiosError: vi.fn(() => false),
  },
}));

const USER_AGENT = 'skosmos-mcp/0.2.1';

describe('SparqlClient User-Agent', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
  });

  it('sends the configured User-Agent on queries', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { head: { vars: [] }, results: { bindings: [] } } });
    const client = new SparqlClient('https://api.finto.fi/sparql', '', '', USER_AGENT);

    await client.executeQuery('SELECT * WHERE { ?s ?p ?o } LIMIT 1');

    const config = vi.mocked(axios.get).mock.calls[0]![1] as { headers: Record<string, string> };
    expect(config.headers['User-Agent']).toBe(USER_AGENT);
  });

  it('sends the configured User-Agent on updates', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: '' });
    const client = new SparqlClient('https://api.finto.fi/sparql', '', '', USER_AGENT);

    await client.executeUpdate('INSERT DATA { <urn:a> <urn:b> <urn:c> }');

    const config = vi.mocked(axios.post).mock.calls[0]![2] as { headers: Record<string, string> };
    expect(config.headers['User-Agent']).toBe(USER_AGENT);
  });
});
