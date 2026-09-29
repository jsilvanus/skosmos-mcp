import { createHash } from 'node:crypto';
import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthConfig } from './config.js';
import { fetchCimdMetadata, isCimdClientId, type CimdMetadata } from './cimd.js';
import { contentSecurityPolicy, redirectSource } from './csp.js';
import { OidcRelyingParty } from './oidc.js';
import { randomToken, verifyS256 } from './pkce.js';
import { ACCESS_TOKEN_TTL_SECONDS, TokenService, type Identity } from './tokens.js';
import { TtlStore } from './ttl-store.js';
import { logger } from '../util/logger.js';

/**
 * Embedded OAuth authorization server (for MCP clients) whose only sign-in method is OIDC, plus
 * the resource-server check for `/mcp`. Ported from jsilvanus/codestash mcp/api-connector-style
 * (Fastify) to the Express app of this repo. Only mounted when OIDC_ISSUER is set.
 */

export interface AuthOptions {
  /** Resolves a CIMD client_id to its metadata. Replaceable in tests. */
  fetchClientMetadata?: (clientId: string) => Promise<CimdMetadata>;
  /** Requests per IP per minute on the sign-in and token endpoints (default 60). */
  rateLimitPerMinute?: number;
}

type OAuthQuery = Record<string, string | undefined>;

interface PendingSignIn {
  purpose: 'oauth';
  oauth: string;
  nonce: string;
  codeVerifier: string;
}

interface AuthorizationCode {
  clientId: string;
  redirectUri: string;
  challenge: string;
  identity: Identity;
  scope: string;
}

export const OIDC_COOKIE = 'skosmos_oidc';
const OIDC_STATE_TTL_MS = 10 * 60_000;
const AUTHORIZATION_CODE_TTL_MS = 60_000;
const INVALID_REQUEST = '<h1>Invalid authorization request</h1>';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(title: string, body: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' +
    escapeHtml(title) +
    '</title><style>body{font-family:system-ui,sans-serif;background:#f6f7f9;margin:0;padding:4rem 1rem}main{max-width:420px;margin:0 auto;background:#fff;padding:2rem;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{margin-top:0}a.button,button{display:inline-block;margin-top:1rem;padding:.7rem 1.1rem;border:0;border-radius:7px;cursor:pointer;background:#1f5fbf;color:#fff;text-decoration:none;font:inherit}.secondary{margin-left:.5rem;background:#eee;color:#000}.error{color:#b00020}</style></head><body><main>' +
    body +
    '</main></body></html>'
  );
}

function signInPage(oauth: string, clientName: string, buttonLabel: string): string {
  return page(
    'Sign in',
    '<h1>Sign in</h1><p>Sign in to authorize <strong>' +
      escapeHtml(clientName) +
      '</strong> to use this Skosmos MCP server.</p>' +
      '<a class="button" href="/oidc/login?oauth=' +
      encodeURIComponent(oauth) +
      '">' +
      escapeHtml(buttonLabel) +
      '</a>',
  );
}

function consentPage(oauth: string, ticket: string, userName: string, clientName: string): string {
  return page(
    'Authorize MCP client',
    '<h1>Authorize MCP client</h1><p><strong>' +
      escapeHtml(clientName) +
      '</strong> wants access to this Skosmos MCP server as <strong>' +
      escapeHtml(userName) +
      '</strong>.</p><form method="post" action="/oauth/authorize">' +
      '<input type="hidden" name="oauth" value="' +
      escapeHtml(oauth) +
      '">' +
      '<input type="hidden" name="ticket" value="' +
      escapeHtml(ticket) +
      '">' +
      '<button type="submit" name="action" value="approve">Approve</button>' +
      '<button class="secondary" type="submit" name="action" value="deny">Deny</button></form>',
  );
}

function errorPage(message: string): string {
  return page(
    'Sign-in failed',
    '<h1>Sign-in failed</h1><p class="error">' +
      escapeHtml(message) +
      '</p><p>Return to your MCP client and start the connection again.</p>',
  );
}

function encodeOAuth(query: OAuthQuery): string {
  const entries = Object.entries(query).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return Buffer.from(new URLSearchParams(entries).toString()).toString('base64url');
}

function decodeOAuth(value: string): OAuthQuery {
  return Object.fromEntries(new URLSearchParams(Buffer.from(value, 'base64url').toString('utf8')));
}

/** Express query/body values as plain strings (repeated or nested parameters are dropped). */
function stringRecord(value: unknown): OAuthQuery {
  const out: OAuthQuery = {};
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string') out[key] = v;
    }
  }
  return out;
}

function sendHtml(res: Response, html: string, formAction: string[] = [], status = 200): void {
  res
    .status(status)
    .set('Content-Security-Policy', contentSecurityPolicy(formAction))
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(html);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

function errorDetails(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return { error: err.name, reason: err.message, ...(typeof code === 'string' ? { code } : {}) };
  }
  return { error: String(err) };
}

export function wwwAuthenticate(publicUrl: string, error?: string): string {
  return (
    'Bearer resource_metadata="' +
    publicUrl +
    '/.well-known/oauth-protected-resource/mcp", scope="mcp"' +
    (error
      ? ', error="' +
        error +
        '", error_description="The access token is missing, expired or invalid."'
      : '')
  );
}

/**
 * Mounts discovery metadata, `/oauth/*` and `/oidc/*` on the app and returns the middleware that
 * protects `/mcp` (401 + WWW-Authenticate without a valid access token).
 */
export function mountAuth(
  app: Express,
  config: AuthConfig,
  options: AuthOptions = {},
): RequestHandler {
  const { publicUrl, resource } = config;
  const fetchClientMetadata = options.fetchClientMetadata ?? fetchCimdMetadata;
  const tokens = new TokenService(config.jwtSecret, publicUrl, resource);
  const rp = new OidcRelyingParty(config.oidc, config.production);
  const pendingSignIns = new TtlStore<PendingSignIn>();
  const authorizationCodes = new TtlStore<AuthorizationCode>();
  const limiter = rateLimit({
    windowMs: 60_000,
    limit: options.rateLimitPerMinute ?? 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const form = express.urlencoded({ extended: false, limit: '64kb' });

  async function validateRequest(q: OAuthQuery): Promise<CimdMetadata> {
    if (
      q['response_type'] !== 'code' ||
      !q['client_id'] ||
      !q['redirect_uri'] ||
      !q['code_challenge'] ||
      q['code_challenge_method'] !== 'S256'
    ) {
      throw new Error('Invalid OAuth request');
    }
    // A client that names a resource must name this one (RFC 8707).
    if (q['resource'] !== undefined && q['resource'] !== resource)
      throw new Error('Invalid resource');
    if (!isCimdClientId(q['client_id'])) throw new Error('Invalid client_id');
    const metadata = await fetchClientMetadata(q['client_id']);
    if (!metadata.redirect_uris.includes(q['redirect_uri']))
      throw new Error('Invalid redirect_uri');
    return metadata;
  }

  // ── Discovery (as in the codestash scaffold; no OIDC-provider fields) ──────────────────────────
  const asMetadata = {
    issuer: publicUrl,
    authorization_endpoint: publicUrl + '/oauth/authorize',
    token_endpoint: publicUrl + '/oauth/token',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
  const protectedResource = {
    resource,
    authorization_servers: [publicUrl],
    scopes_supported: ['mcp'],
    bearer_methods_supported: ['header'],
  };
  // RFC 9728: metadata of resource <publicUrl>/mcp at the path-inserted URL; root kept for older clients.
  app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
    res.json(protectedResource);
  });
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json(protectedResource);
  });
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json(asMetadata);
  });
  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json(asMetadata);
  });

  // ── Authorization endpoint ───────────────────────────────────────────────────────────────────
  // Sign-in is OIDC only: a page with the single SSO button, which starts /oidc/login?oauth=...
  app.get('/oauth/authorize', limiter, async (req, res) => {
    const q = stringRecord(req.query);
    try {
      const metadata = await validateRequest(q);
      sendHtml(res, signInPage(encodeOAuth(q), metadata.client_name, config.oidc.buttonLabel));
    } catch {
      sendHtml(res, page('Invalid request', INVALID_REQUEST), [], 400);
    }
  });

  // Consent decision, authenticated by the login ticket issued after the OIDC callback.
  app.post('/oauth/authorize', limiter, form, async (req, res) => {
    const body = stringRecord(req.body);
    const oauth = body['oauth'];
    let q: OAuthQuery;
    try {
      if (!oauth) throw new Error('Missing oauth');
      q = decodeOAuth(oauth);
      await validateRequest(q);
    } catch {
      sendHtml(res, page('Invalid request', INVALID_REQUEST), [], 400);
      return;
    }

    const identity = body['ticket']
      ? await tokens.verifyLoginTicket(body['ticket'], oauth)
      : undefined;
    if (!identity || identity.issuer !== config.oidc.issuer) {
      sendHtml(
        res,
        page(
          'Sign in again',
          '<h1>Your sign-in has expired</h1><p class="error">Please sign in again.</p>' +
            '<a class="button" href="/oidc/login?oauth=' +
            encodeURIComponent(oauth) +
            '">' +
            escapeHtml(config.oidc.buttonLabel) +
            '</a>',
        ),
        [],
        401,
      );
      return;
    }

    const target = new URL(q['redirect_uri']!);
    if (body['action'] !== 'approve') {
      target.searchParams.set('error', 'access_denied');
    } else {
      const code = randomToken();
      authorizationCodes.set(
        code,
        {
          clientId: q['client_id']!,
          redirectUri: q['redirect_uri']!,
          challenge: q['code_challenge']!,
          identity: { issuer: identity.issuer, subject: identity.subject },
          scope: q['scope'] ?? 'mcp',
        },
        AUTHORIZATION_CODE_TTL_MS,
      );
      target.searchParams.set('code', code);
    }
    target.searchParams.set('iss', publicUrl);
    if (q['state']) target.searchParams.set('state', q['state']);
    res.redirect(302, target.toString());
  });

  // ── Token endpoint ───────────────────────────────────────────────────────────────────────────
  app.post('/oauth/token', limiter, form, async (req, res) => {
    const b = stringRecord(req.body);
    res.set('Cache-Control', 'no-store'); // RFC 6749 §5.1
    if (b['resource'] !== undefined && b['resource'] !== resource) {
      res.status(400).json({ error: 'invalid_target' });
      return;
    }

    if (b['grant_type'] === 'authorization_code') {
      const code = b['code'] ? authorizationCodes.take(b['code']) : undefined;
      if (
        !code ||
        b['client_id'] !== code.clientId ||
        b['redirect_uri'] !== code.redirectUri ||
        !b['code_verifier'] ||
        !verifyS256(b['code_verifier'], code.challenge)
      ) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      res.json({
        access_token: await tokens.issueAccessToken(code.identity, code.clientId, code.scope),
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: await tokens.issueRefreshToken(code.identity, code.clientId, code.scope),
        scope: code.scope,
      });
      return;
    }

    if (b['grant_type'] === 'refresh_token') {
      const refresh = b['refresh_token']
        ? await tokens.verifyRefreshToken(b['refresh_token'])
        : undefined;
      // Tokens from another IdP (OIDC_ISSUER changed) keep no access.
      if (
        !refresh ||
        b['client_id'] !== refresh.clientId ||
        refresh.identity.issuer !== config.oidc.issuer
      ) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      res.json({
        access_token: await tokens.issueAccessToken(
          refresh.identity,
          refresh.clientId,
          refresh.scope,
        ),
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_SECONDS,
        scope: refresh.scope,
      });
      return;
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  // ── OIDC Relying Party ───────────────────────────────────────────────────────────────────────
  const cookieBase = `Path=/oidc; HttpOnly; SameSite=Lax${config.production ? '; Secure' : ''}`;

  // No web UI here, so the only purpose is continuing an MCP OAuth authorization request.
  app.get('/oidc/login', limiter, async (req, res) => {
    const oauth = typeof req.query['oauth'] === 'string' ? req.query['oauth'] : undefined;
    try {
      if (!oauth) throw new Error('Missing oauth');
      await validateRequest(decodeOAuth(oauth));
    } catch {
      sendHtml(res, page('Invalid request', INVALID_REQUEST), [], 400);
      return;
    }

    let request;
    try {
      request = await rp.authorizationRequest();
    } catch (err) {
      logger.error('OIDC discovery failed', errorDetails(err));
      sendHtml(
        res,
        errorPage('The sign-in service is not available right now. Try again later.'),
        [],
        502,
      );
      return;
    }
    pendingSignIns.set(
      sha256(request.state),
      { purpose: 'oauth', oauth, nonce: request.nonce, codeVerifier: request.codeVerifier },
      OIDC_STATE_TTL_MS,
    );
    res.set('Cache-Control', 'no-store');
    res.set(
      'Set-Cookie',
      `${OIDC_COOKIE}=${encodeURIComponent(request.state)}; ${cookieBase}; Max-Age=${OIDC_STATE_TTL_MS / 1000}`,
    );
    res.redirect(302, request.url.toString());
  });

  app.get('/oidc/callback', limiter, async (req, res) => {
    const query = stringRecord(req.query);
    const cookieState = readCookie(req, OIDC_COOKIE);
    res.set('Set-Cookie', `${OIDC_COOKIE}=; ${cookieBase}; Max-Age=0`);

    const state = query['state'];
    // Login-CSRF protection: the state must come back to the same browser that started the sign-in.
    if (!state || !cookieState || state !== cookieState) {
      logger.warn('OIDC callback refused: state does not match the sign-in cookie');
      sendHtml(res, errorPage('The sign-in could not be verified. Please start again.'), [], 400);
      return;
    }
    const pending = pendingSignIns.take(sha256(state)); // single use
    if (!pending) {
      logger.warn('OIDC callback refused: unknown, expired or already used state');
      sendHtml(
        res,
        errorPage('The sign-in has expired or was already used. Please start again.'),
        [],
        400,
      );
      return;
    }
    if (query['error']) {
      logger.warn('OIDC provider returned an error', { error: query['error'] });
      sendHtml(
        res,
        errorPage('The sign-in was cancelled or refused by the identity provider.'),
        [],
        400,
      );
      return;
    }

    let identity;
    try {
      const currentUrl = new URL(config.oidc.redirectUri);
      currentUrl.search = new URLSearchParams(
        Object.entries(query).filter((e): e is [string, string] => typeof e[1] === 'string'),
      ).toString();
      identity = await rp.callback(currentUrl, {
        state,
        nonce: pending.nonce,
        codeVerifier: pending.codeVerifier,
      });
    } catch (err) {
      logger.warn('OIDC sign-in failed', errorDetails(err));
      sendHtml(res, errorPage('The sign-in could not be completed. Please start again.'), [], 400);
      return;
    }

    // Continue the MCP authorization request where it left off: the consent page.
    let q: OAuthQuery;
    let metadata: CimdMetadata;
    try {
      q = decodeOAuth(pending.oauth);
      metadata = await validateRequest(q);
    } catch {
      sendHtml(res, page('Invalid request', INVALID_REQUEST), [], 400);
      return;
    }
    logger.info('OIDC sign-in succeeded', {
      idpIssuer: identity.issuer,
      subject: identity.subject,
    });
    const ticket = await tokens.issueLoginTicket(identity, pending.oauth);
    // Approve/deny redirect to the client: form-action must allow its redirect_uri (see LEARNED.md).
    sendHtml(
      res,
      consentPage(pending.oauth, ticket, identity.name ?? identity.subject, metadata.client_name),
      [redirectSource(q['redirect_uri']!)],
    );
  });

  // ── Resource server: protects /mcp ───────────────────────────────────────────────────────────
  return async (req, res, next) => {
    const challenge = (error?: string) => {
      res
        .status(401)
        .set('WWW-Authenticate', wwwAuthenticate(publicUrl, error))
        .json({ error: error ?? 'unauthorized' });
    };
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      challenge();
      return;
    }
    const token = header.slice('Bearer '.length);
    try {
      const payload = await tokens.verifyAccessToken(token);
      if (payload.idp_iss !== config.oidc.issuer) throw new Error('Token from another IdP');
      (req as Request & { auth?: unknown }).auth = {
        token,
        clientId: typeof payload.client_id === 'string' ? payload.client_id : 'oauth-client',
        scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
        ...(typeof payload.exp === 'number' ? { expiresAt: payload.exp } : {}),
        extra: { idpIssuer: payload.idp_iss, subject: payload.sub },
      };
      next();
    } catch {
      // An invalid token is never treated as anonymous: the client must refresh or re-authorize.
      challenge('invalid_token');
    }
  };
}
