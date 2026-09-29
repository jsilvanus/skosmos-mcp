import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';

/**
 * Minimal OIDC provider for tests (node:http + jose, RS256 ID tokens). Serves discovery, /jwks,
 * /authorize (302 back with code + state), /token and /userinfo under an authentik-style issuer
 * path with a trailing slash.
 */
export interface FakeUser {
  sub: string;
  name?: string;
  email?: string;
  email_verified?: boolean;
}

interface PendingCode {
  clientId: string;
  redirectUri: string;
  nonce: string | undefined;
  codeChallenge: string | undefined;
  user: FakeUser;
}

export interface FakeOidcProvider {
  issuer: string;
  clientId: string;
  clientSecret: string | undefined;
  /** User returned by the next /authorize calls. */
  user: FakeUser;
  /** When set, /authorize redirects back with this `error` instead of a code. */
  authorizeError: string | undefined;
  /** When set, the ID token carries this nonce instead of the requested one. */
  nonceOverride: string | undefined;
  /** Include the email claim in the ID token (otherwise only /userinfo has it). */
  emailInIdToken: boolean;
  /** Last /authorize query and last /token request, for assertions. */
  lastAuthorize: URLSearchParams | undefined;
  lastTokenAuth: 'basic' | 'none' | undefined;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export async function startFakeOidcProvider(options: {
  clientId?: string;
  clientSecret?: string;
}): Promise<FakeOidcProvider> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    kid: 'test-key',
    alg: 'RS256',
    use: 'sig',
  };
  const codes = new Map<string, PendingCode>();
  const accessTokens = new Map<string, FakeUser>();
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const path = '/application/o/skosmos/';

  const provider: FakeOidcProvider = {
    issuer: base + path,
    clientId: options.clientId ?? 'skosmos-client',
    clientSecret: options.clientSecret,
    user: { sub: 'user-123', name: 'Test User', email: 'test@example.org', email_verified: true },
    authorizeError: undefined,
    nonceOverride: undefined,
    emailInIdToken: true,
    lastAuthorize: undefined,
    lastTokenAuth: undefined,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base);
      if (req.method === 'GET' && url.pathname === path + '.well-known/openid-configuration') {
        json(res, 200, {
          issuer: provider.issuer,
          authorization_endpoint: base + path + 'authorize',
          token_endpoint: base + path + 'token',
          userinfo_endpoint: base + path + 'userinfo',
          jwks_uri: base + path + 'jwks',
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === path + 'jwks') {
        json(res, 200, { keys: [publicJwk] });
        return;
      }
      if (req.method === 'GET' && url.pathname === path + 'authorize') {
        const q = url.searchParams;
        provider.lastAuthorize = q;
        const redirect = new URL(q.get('redirect_uri') ?? '');
        if (q.get('client_id') !== provider.clientId) {
          json(res, 400, { error: 'invalid_client' });
          return;
        }
        if (provider.authorizeError) {
          redirect.searchParams.set('error', provider.authorizeError);
        } else {
          const code = randomBytes(16).toString('base64url');
          codes.set(code, {
            clientId: provider.clientId,
            redirectUri: q.get('redirect_uri') ?? '',
            nonce: q.get('nonce') ?? undefined,
            codeChallenge: q.get('code_challenge') ?? undefined,
            user: { ...provider.user },
          });
          redirect.searchParams.set('code', code);
        }
        const state = q.get('state');
        if (state) redirect.searchParams.set('state', state);
        res.writeHead(302, { Location: redirect.toString() });
        res.end();
        return;
      }
      if (req.method === 'POST' && url.pathname === path + 'token') {
        const body = new URLSearchParams(await readBody(req));
        const authHeader = req.headers.authorization;
        if (provider.clientSecret) {
          // RFC 6749 §2.3.1: id and secret are form-urlencoded before base64.
          const decoded = Buffer.from(
            authHeader?.replace(/^Basic /, '') ?? '',
            'base64',
          ).toString();
          const [id, secret] = decoded
            .split(':')
            .map((part) => decodeURIComponent(part.replaceAll('+', ' ')));
          if (
            !authHeader?.startsWith('Basic ') ||
            id !== provider.clientId ||
            secret !== provider.clientSecret
          ) {
            json(res, 401, { error: 'invalid_client' });
            return;
          }
          provider.lastTokenAuth = 'basic';
        } else {
          if (authHeader || body.get('client_id') !== provider.clientId) {
            json(res, 401, { error: 'invalid_client' });
            return;
          }
          provider.lastTokenAuth = 'none';
        }
        const code = body.get('code') ?? '';
        const pending = codes.get(code);
        codes.delete(code);
        const verifier = body.get('code_verifier') ?? '';
        if (
          !pending ||
          body.get('grant_type') !== 'authorization_code' ||
          body.get('redirect_uri') !== pending.redirectUri ||
          !pending.codeChallenge ||
          createHash('sha256').update(verifier).digest('base64url') !== pending.codeChallenge
        ) {
          json(res, 400, { error: 'invalid_grant' });
          return;
        }
        const accessToken = randomBytes(16).toString('base64url');
        accessTokens.set(accessToken, pending.user);
        const nonce = provider.nonceOverride ?? pending.nonce;
        const idToken = await new SignJWT({
          ...(nonce ? { nonce } : {}),
          ...(pending.user.name ? { name: pending.user.name } : {}),
          ...(provider.emailInIdToken && pending.user.email
            ? { email: pending.user.email, email_verified: pending.user.email_verified ?? false }
            : {}),
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
          .setIssuer(provider.issuer)
          .setSubject(pending.user.sub)
          .setAudience(provider.clientId)
          .setIssuedAt()
          .setExpirationTime('5m')
          .sign(privateKey);
        json(res, 200, {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 300,
          id_token: idToken,
        });
        return;
      }
      if (req.method === 'GET' && url.pathname === path + 'userinfo') {
        const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
        const user = accessTokens.get(token);
        if (!user) {
          json(res, 401, { error: 'invalid_token' });
          return;
        }
        json(res, 200, user);
        return;
      }
      json(res, 404, { error: 'not_found' });
    })().catch(() => {
      json(res, 500, { error: 'server_error' });
    });
  });

  return provider;
}
