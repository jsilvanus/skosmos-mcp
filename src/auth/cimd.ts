// Ported from jsilvanus/codestash mcp/api-connector-style (src/oauth/cimd.ts).
import { lookup } from 'node:dns/promises';

export interface CimdMetadata {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
}

const MAX_BYTES = 64 * 1024;

export function isCimdClientId(clientId: string): boolean {
  try {
    const u = new URL(clientId);
    return (
      u.protocol === 'https:' &&
      u.pathname !== '/' &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      !u.pathname.split('/').includes('..')
    );
  } catch {
    return false;
  }
}

export async function fetchCimdMetadata(clientId: string): Promise<CimdMetadata> {
  if (!isCimdClientId(clientId)) throw new Error('Invalid CIMD client_id');
  let current = new URL(clientId);
  for (let i = 0; i <= 3; i++) {
    await assertPublicHost(current.hostname);
    const response = await fetch(current, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || i === 3) throw new Error('Invalid CIMD redirect');
      current = new URL(location, current);
      if (!isCimdClientId(current.toString())) throw new Error('Invalid CIMD redirect');
      continue;
    }
    if (!response.ok) throw new Error('Unable to fetch CIMD document');
    const length = response.headers.get('content-length');
    if (length && Number(length) > MAX_BYTES) throw new Error('CIMD document is too large');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
      throw new Error('CIMD document is too large');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error('Invalid CIMD document');
    }
    if (!value || typeof value !== 'object') throw new Error('Invalid CIMD document');
    const v = value as Record<string, unknown>;
    if (
      v.client_id !== clientId ||
      typeof v.client_name !== 'string' ||
      !Array.isArray(v.redirect_uris) ||
      v.redirect_uris.some((x) => typeof x !== 'string')
    ) {
      throw new Error('Invalid CIMD document');
    }
    return {
      client_id: clientId,
      client_name: v.client_name,
      redirect_uris: v.redirect_uris as string[],
      ...(Array.isArray(v.grant_types)
        ? { grant_types: v.grant_types.filter((x): x is string => typeof x === 'string') }
        : {}),
      ...(Array.isArray(v.response_types)
        ? { response_types: v.response_types.filter((x): x is string => typeof x === 'string') }
        : {}),
      ...(typeof v.token_endpoint_auth_method === 'string'
        ? { token_endpoint_auth_method: v.token_endpoint_auth_method }
        : {}),
    };
  }
  throw new Error('Unable to fetch CIMD document');
}

async function assertPublicHost(hostname: string) {
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((x) => privateIp(x.address)))
    throw new Error('CIMD host resolves to a private address');
}

function privateIp(address: string) {
  if (address.includes(':')) {
    const n = address.toLowerCase();
    return n === '::1' || n.startsWith('fc') || n.startsWith('fd') || /^fe[89ab]/.test(n);
  }
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
  const [a = 0, b = 0] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
