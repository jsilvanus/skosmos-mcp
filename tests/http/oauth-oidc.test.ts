import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { AuthConfigError, loadAuthConfig } from '../../src/auth/config.js';
import type { AuthOptions } from '../../src/auth/router.js';
import type { CimdMetadata } from '../../src/auth/cimd.js';
import { createHttpApp } from '../../src/http-app.js';
import { startFakeOidcProvider, type FakeOidcProvider } from '../helpers/fake-oidc-provider.js';

const CLIENT_ID = 'https://client.example/oauth/client.json';
const REDIRECT_URI = 'https://client.example/callback';
const JWT_SECRET = randomBytes(32).toString('base64');

const fetchClientMetadata = async (clientId: string): Promise<CimdMetadata> => {
  if (clientId !== CLIENT_ID) throw new Error('unknown client');
  return { client_id: CLIENT_ID, client_name: 'Test MCP Client', redirect_uris: [REDIRECT_URI] };
};

interface Running {
  base: string;
  close(): Promise<void>;
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function baseConfig() {
  const saved = { ...process.env };
  try {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('SKOSMOS_') || key.startsWith('SPARQL_') || key.startsWith('MCP_HTTP_')) {
        delete process.env[key];
      }
    }
    return loadConfig();
  } finally {
    process.env = saved;
  }
}

/** Starts the app on an ephemeral port; `env` builds the auth config once the public URL is known. */
async function startApp(
  env: ((publicUrl: string) => Record<string, string>) | undefined,
  authOptions: AuthOptions = {},
): Promise<Running> {
  const server: Server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const auth = env ? loadAuthConfig(env(base)) : undefined;
  const app = createHttpApp(baseConfig(), {
    ...(auth ? { auth } : {}),
    authOptions: { fetchClientMetadata, rateLimitPerMinute: 10_000, ...authOptions },
  });
  server.on('request', app);
  const running = {
    base,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
  cleanups.push(running.close);
  return running;
}

async function startIdp(options: { clientSecret?: string } = {}): Promise<FakeOidcProvider> {
  const idp = await startFakeOidcProvider(options);
  cleanups.push(() => idp.close());
  return idp;
}

function oidcEnv(idp: FakeOidcProvider) {
  return (publicUrl: string): Record<string, string> => ({
    OIDC_ISSUER: idp.issuer,
    OIDC_CLIENT_ID: idp.clientId,
    ...(idp.clientSecret ? { OIDC_CLIENT_SECRET: idp.clientSecret } : {}),
    MCP_PUBLIC_URL: publicUrl,
    JWT_SECRET,
  });
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function authorizeQuery(challenge: string, base: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'client-state',
    scope: 'mcp',
    resource: base + '/mcp',
    ...extra,
  });
}

const get = (url: string, headers: Record<string, string> = {}) =>
  fetch(url, { redirect: 'manual', headers });

const postForm = (url: string, body: Record<string, string>) =>
  fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });

function hidden(html: string, name: string): string {
  const match = new RegExp(`name="${name}" value="([^"]*)"`).exec(html);
  if (!match?.[1]) throw new Error(`no hidden field ${name}`);
  return match[1].replaceAll('&amp;', '&').replaceAll('&quot;', '"');
}

function cookieFrom(res: Response): string {
  const header = res.headers.get('set-cookie') ?? '';
  const match = /skosmos_oidc=([^;]*)/.exec(header);
  if (!match?.[1]) throw new Error('no oidc cookie');
  return `skosmos_oidc=${match[1]}`;
}

const mcpCall = (base: string, token?: string) =>
  fetch(base + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });

/** Runs the browser part up to the IdP redirect back to /oidc/callback. */
async function startSignIn(app: Running, challenge: string) {
  const authorize = await get(app.base + '/oauth/authorize?' + authorizeQuery(challenge, app.base));
  expect(authorize.status).toBe(200);
  const html = await authorize.text();
  const href = /href="(\/oidc\/login\?oauth=[^"]+)"/.exec(html)?.[1];
  expect(href).toBeDefined();

  const login = await get(app.base + href!.replaceAll('&amp;', '&'));
  expect(login.status).toBe(302);
  const cookie = cookieFrom(login);
  expect(login.headers.get('set-cookie')).toMatch(
    /Path=\/oidc; HttpOnly; SameSite=Lax; Max-Age=600/,
  );
  const idpAuthorize = login.headers.get('location')!;

  const idpRedirect = await get(idpAuthorize);
  expect(idpRedirect.status).toBe(302);
  const callbackUrl = idpRedirect.headers.get('location')!;
  expect(callbackUrl.startsWith(app.base + '/oidc/callback?')).toBe(true);
  return { cookie, callbackUrl, idpAuthorize: new URL(idpAuthorize) };
}

async function fullFlow(app: Running) {
  const { verifier, challenge } = pkce();
  const { cookie, callbackUrl } = await startSignIn(app, challenge);

  const consent = await get(callbackUrl, { Cookie: cookie });
  expect(consent.status).toBe(200);
  expect(consent.headers.get('content-security-policy')).toContain(
    "form-action 'self' https://client.example",
  );
  const consentHtml = await consent.text();
  expect(consentHtml).toContain('Test User');

  const approve = await postForm(app.base + '/oauth/authorize', {
    oauth: hidden(consentHtml, 'oauth'),
    ticket: hidden(consentHtml, 'ticket'),
    action: 'approve',
  });
  expect(approve.status).toBe(302);
  const redirect = new URL(approve.headers.get('location')!);
  expect(redirect.origin + redirect.pathname).toBe(REDIRECT_URI);
  expect(redirect.searchParams.get('state')).toBe('client-state');
  expect(redirect.searchParams.get('iss')).toBe(app.base);
  const code = redirect.searchParams.get('code')!;

  const tokenRes = await postForm(app.base + '/oauth/token', {
    grant_type: 'authorization_code',
    code,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    resource: app.base + '/mcp',
  });
  expect(tokenRes.status).toBe(200);
  expect(tokenRes.headers.get('cache-control')).toBe('no-store');
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string };
  return { code, verifier, tokens };
}

describe('HTTP transport with OIDC off (OIDC_ISSUER unset)', () => {
  it('serves /mcp without authentication and exposes no OAuth/OIDC routes', async () => {
    const app = await startApp(undefined);
    const res = await mcpCall(app.base);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"tools"');

    for (const path of [
      '/oidc/login',
      '/oidc/callback',
      '/oauth/authorize',
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
    ]) {
      expect((await get(app.base + path)).status, path).toBe(404);
    }
    expect((await postForm(app.base + '/oauth/token', {})).status).toBe(404);
  });

  it('loadAuthConfig returns undefined when OIDC_ISSUER is unset or empty', () => {
    expect(loadAuthConfig({})).toBeUndefined();
    expect(loadAuthConfig({ OIDC_ISSUER: '  ', OIDC_CLIENT_ID: 'x' })).toBeUndefined();
  });
});

describe('auth configuration errors', () => {
  const valid = {
    OIDC_ISSUER: 'https://auth.example.org/application/o/skosmos/',
    OIDC_CLIENT_ID: 'client',
    MCP_PUBLIC_URL: 'https://skosmos.example.org/',
    JWT_SECRET,
  };

  it('accepts a valid configuration with defaults', () => {
    const config = loadAuthConfig({ ...valid, NODE_ENV: 'production' })!;
    expect(config.publicUrl).toBe('https://skosmos.example.org');
    expect(config.resource).toBe('https://skosmos.example.org/mcp');
    expect(config.oidc.redirectUri).toBe('https://skosmos.example.org/oidc/callback');
    expect(config.oidc.scopes).toBe('openid email profile');
    expect(config.oidc.buttonLabel).toBe('Sign in with single sign-on');
    expect(config.oidc.clientSecret).toBeUndefined();
  });

  it.each([
    ['missing OIDC_CLIENT_ID', { OIDC_CLIENT_ID: '' }, /OIDC_CLIENT_ID/],
    [
      'issuer not a URL',
      { OIDC_ISSUER: 'auth.example.org' },
      /OIDC_ISSUER must be an absolute URL/,
    ],
    ['scopes without openid', { OIDC_SCOPES: 'email profile' }, /openid/],
    ['missing MCP_PUBLIC_URL', { MCP_PUBLIC_URL: '' }, /MCP_PUBLIC_URL/],
    ['missing JWT_SECRET', { JWT_SECRET: '' }, /JWT_SECRET is required/],
    ['short JWT_SECRET', { JWT_SECRET: Buffer.alloc(16).toString('base64') }, /at least 32 bytes/],
    ['non-base64 JWT_SECRET', { JWT_SECRET: 'not base64!' }, /base64/],
  ])('%s', (_name, override, message) => {
    expect(() => loadAuthConfig({ ...valid, ...override })).toThrow(message);
    expect(() => loadAuthConfig({ ...valid, ...override })).toThrow(AuthConfigError);
  });

  it('requires https in production but allows http otherwise', () => {
    const http = { ...valid, OIDC_ISSUER: 'http://localhost:9000/application/o/skosmos/' };
    expect(() => loadAuthConfig({ ...http, NODE_ENV: 'production' })).toThrow(/https/);
    expect(loadAuthConfig({ ...http, NODE_ENV: 'development' })).toBeDefined();
    const httpPublic = { ...valid, MCP_PUBLIC_URL: 'http://localhost:3000' };
    expect(() => loadAuthConfig({ ...httpPublic, NODE_ENV: 'production' })).toThrow(/https/);
  });
});

describe('HTTP transport with OIDC on', () => {
  it('challenges unauthenticated /mcp and publishes OAuth metadata without OP fields', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp));

    const res = await mcpCall(app.base);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer resource_metadata="${app.base}/.well-known/oauth-protected-resource/mcp", scope="mcp"`,
    );

    const invalid = await mcpCall(app.base, 'not-a-token');
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('www-authenticate')).toContain('error="invalid_token"');

    const prm = (await (
      await get(app.base + '/.well-known/oauth-protected-resource/mcp')
    ).json()) as {
      resource: string;
      authorization_servers: string[];
    };
    expect(prm.resource).toBe(app.base + '/mcp');
    expect(prm.authorization_servers).toEqual([app.base]);

    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/openid-configuration',
    ]) {
      const meta = (await (await get(app.base + path)).json()) as Record<string, unknown>;
      expect(meta['issuer']).toBe(app.base);
      expect(meta['authorization_endpoint']).toBe(app.base + '/oauth/authorize');
      expect(meta['client_id_metadata_document_supported']).toBe(true);
      expect(meta).not.toHaveProperty('jwks_uri');
      expect(meta).not.toHaveProperty('userinfo_endpoint');
      expect(meta).not.toHaveProperty('id_token_signing_alg_values_supported');
    }
  });

  it('runs the full MCP OAuth flow via OIDC (confidential client) ending with an authorized /mcp call', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp));
    const { tokens } = await fullFlow(app);

    // The IdP saw PKCE, a nonce and our callback; the code grant used client_secret_basic.
    expect(idp.lastAuthorize?.get('code_challenge_method')).toBe('S256');
    expect(idp.lastAuthorize?.get('nonce')).toBeTruthy();
    expect(idp.lastAuthorize?.get('redirect_uri')).toBe(app.base + '/oidc/callback');
    expect(idp.lastAuthorize?.get('scope')).toBe('openid email profile');
    expect(idp.lastTokenAuth).toBe('basic');

    const res = await mcpCall(app.base, tokens.access_token);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('"tools"');

    // Refresh grant issues a new working access token.
    const refreshed = await postForm(app.base + '/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: CLIENT_ID,
    });
    expect(refreshed.status).toBe(200);
    const { access_token } = (await refreshed.json()) as { access_token: string };
    expect((await mcpCall(app.base, access_token)).status).toBe(200);

    // Refresh token bound to its client; tokens are not interchangeable.
    const wrongClient = await postForm(app.base + '/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: 'https://other.example/client.json',
    });
    expect(wrongClient.status).toBe(400);
    expect((await mcpCall(app.base, tokens.refresh_token)).status).toBe(401);
  });

  it('works as a public OIDC client (no OIDC_CLIENT_SECRET), fetching userinfo when the ID token has no email', async () => {
    const idp = await startIdp();
    idp.emailInIdToken = false;
    idp.user = { sub: 'user-456', email: 'only-userinfo@example.org' };
    const app = await startApp(oidcEnv(idp));
    const { verifier, challenge } = pkce();
    const { cookie, callbackUrl } = await startSignIn(app, challenge);
    const consent = await get(callbackUrl, { Cookie: cookie });
    expect(consent.status).toBe(200);
    expect(idp.lastTokenAuth).toBe('none');
    const html = await consent.text();
    expect(html).toContain('only-userinfo@example.org');

    const approve = await postForm(app.base + '/oauth/authorize', {
      oauth: hidden(html, 'oauth'),
      ticket: hidden(html, 'ticket'),
      action: 'approve',
    });
    const code = new URL(approve.headers.get('location')!).searchParams.get('code')!;
    const tokenRes = await postForm(app.base + '/oauth/token', {
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    const { access_token } = (await tokenRes.json()) as { access_token: string };
    expect((await mcpCall(app.base, access_token)).status).toBe(200);
  });

  it('refuses a replayed authorization code', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp));
    const { code, verifier } = await fullFlow(app);
    const replay = await postForm(app.base + '/oauth/token', {
      grant_type: 'authorization_code',
      code,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ error: 'invalid_grant' });
  });

  it('refuses a callback whose state does not match the cookie (login CSRF)', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp));
    const { callbackUrl } = await startSignIn(app, pkce().challenge);

    const noCookie = await get(callbackUrl);
    expect(noCookie.status).toBe(400);
    const wrongCookie = await get(callbackUrl, { Cookie: 'skosmos_oidc=someone-elses-state' });
    expect(wrongCookie.status).toBe(400);
    expect(await wrongCookie.text()).not.toContain('ticket');
  });

  it('refuses a replayed state', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp));
    const { cookie, callbackUrl } = await startSignIn(app, pkce().challenge);
    expect((await get(callbackUrl, { Cookie: cookie })).status).toBe(200);
    const replay = await get(callbackUrl, { Cookie: cookie });
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain('already used');
  });

  it('shows an error page when the IdP returns error=', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    idp.authorizeError = 'access_denied';
    const app = await startApp(oidcEnv(idp));
    const { cookie, callbackUrl } = await startSignIn(app, pkce().challenge);
    const res = await get(callbackUrl, { Cookie: cookie });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('Sign-in failed');
    expect(html).not.toContain('ticket');
  });

  it('refuses an ID token with the wrong nonce', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    idp.nonceOverride = 'not-the-nonce';
    const app = await startApp(oidcEnv(idp));
    const { cookie, callbackUrl } = await startSignIn(app, pkce().challenge);
    const res = await get(callbackUrl, { Cookie: cookie });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('ticket');
  });

  it('re-validates the OAuth request on /oidc/login and /oauth/authorize', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp));
    const { challenge } = pkce();
    const bad = (extra: Record<string, string>) =>
      Buffer.from(authorizeQuery(challenge, app.base, extra).toString()).toString('base64url');

    expect((await get(app.base + '/oidc/login')).status).toBe(400);
    expect(
      (
        await get(
          app.base + '/oidc/login?oauth=' + bad({ redirect_uri: 'https://evil.example/cb' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await get(app.base + '/oidc/login?oauth=' + bad({ code_challenge_method: 'plain' }))).status,
    ).toBe(400);
    expect(
      (await get(app.base + '/oidc/login?oauth=' + bad({ resource: 'https://other.example/mcp' })))
        .status,
    ).toBe(400);
    expect(
      (
        await get(
          app.base +
            '/oauth/authorize?' +
            authorizeQuery(challenge, app.base, { client_id: 'http://insecure.example/c.json' }),
        )
      ).status,
    ).toBe(400);
  });

  it('handles deny, and refuses consent without a valid ticket', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp));
    const { cookie, callbackUrl } = await startSignIn(app, pkce().challenge);
    const html = await (await get(callbackUrl, { Cookie: cookie })).text();
    const oauth = hidden(html, 'oauth');

    const deny = await postForm(app.base + '/oauth/authorize', {
      oauth,
      ticket: hidden(html, 'ticket'),
      action: 'deny',
    });
    expect(deny.status).toBe(302);
    const location = new URL(deny.headers.get('location')!);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('code')).toBeNull();

    const forged = await postForm(app.base + '/oauth/authorize', {
      oauth,
      ticket: 'forged',
      action: 'approve',
    });
    expect(forged.status).toBe(401);
    const missing = await postForm(app.base + '/oauth/authorize', { oauth, action: 'approve' });
    expect(missing.status).toBe(401);

    // A ticket is bound to its authorization request.
    const other = Buffer.from(
      authorizeQuery(pkce().challenge, app.base, { state: 'other' }).toString(),
    ).toString('base64url');
    const crossRequest = await postForm(app.base + '/oauth/authorize', {
      oauth: other,
      ticket: hidden(html, 'ticket'),
      action: 'approve',
    });
    expect(crossRequest.status).toBe(401);
  });

  it('shows the configured button label on the sign-in page', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp((publicUrl) => ({
      ...oidcEnv(idp)(publicUrl),
      OIDC_BUTTON_LABEL: 'Sign in with Authentik',
    }));
    const res = await get(
      app.base + '/oauth/authorize?' + authorizeQuery(pkce().challenge, app.base),
    );
    const html = await res.text();
    expect(html).toContain('Sign in with Authentik');
    expect(html).toContain('Test MCP Client');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rate-limits the sign-in endpoints per IP', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const app = await startApp(oidcEnv(idp), { rateLimitPerMinute: 2 });
    expect((await get(app.base + '/oidc/login')).status).toBe(400);
    expect((await get(app.base + '/oidc/login')).status).toBe(400);
    expect((await get(app.base + '/oidc/login')).status).toBe(429);
  });

  it('starts without the IdP being reachable and answers sign-in with 502', async () => {
    const idp = await startIdp({ clientSecret: 'idp-secret' });
    const issuer = idp.issuer;
    await idp.close();
    cleanups.pop();
    const app = await startApp((publicUrl) => ({
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: 'skosmos-client',
      MCP_PUBLIC_URL: publicUrl,
      JWT_SECRET,
    }));
    const oauth = Buffer.from(authorizeQuery(pkce().challenge, app.base).toString()).toString(
      'base64url',
    );
    const res = await get(app.base + '/oidc/login?oauth=' + oauth);
    expect(res.status).toBe(502);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
