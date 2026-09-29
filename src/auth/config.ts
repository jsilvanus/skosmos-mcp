/**
 * Configuration of the optional OAuth authorization server + OIDC sign-in for the HTTP transport.
 *
 * `OIDC_ISSUER` unset or empty = everything is off: `/mcp` stays open and none of the OAuth/OIDC
 * routes exist. The stdio entry point never reads this.
 */

export interface AuthConfig {
  /** Public origin of this server, without trailing slash (e.g. https://skosmos-mcp.example.org). */
  publicUrl: string;
  /** The MCP resource: `<publicUrl>/mcp`. Used as the access token audience. */
  resource: string;
  /** HS256 key for access tokens, refresh tokens and login tickets. */
  jwtSecret: Uint8Array;
  oidc: OidcConfig;
  production: boolean;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scopes: string;
  buttonLabel: string;
  redirectUri: string;
}

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthConfigError';
  }
}

type Env = Record<string, string | undefined>;

function nonEmpty(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function absoluteUrl(name: string, value: string, production: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AuthConfigError(`${name} must be an absolute URL`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AuthConfigError(`${name} must be an http(s) URL`);
  }
  if (production && url.protocol !== 'https:') {
    throw new AuthConfigError(`${name} must use https: in production (NODE_ENV=production)`);
  }
  return url;
}

/** Returns undefined when OIDC_ISSUER is unset/empty (auth off); throws AuthConfigError on invalid config. */
export function loadAuthConfig(env: Env = process.env): AuthConfig | undefined {
  const issuer = nonEmpty(env, 'OIDC_ISSUER');
  if (!issuer) return undefined;

  const production = env['NODE_ENV'] === 'production';
  absoluteUrl('OIDC_ISSUER', issuer, production);

  const clientId = nonEmpty(env, 'OIDC_CLIENT_ID');
  if (!clientId) throw new AuthConfigError('OIDC_CLIENT_ID is required when OIDC_ISSUER is set');

  const scopes = (nonEmpty(env, 'OIDC_SCOPES') ?? 'openid email profile').split(/\s+/).join(' ');
  if (!scopes.split(' ').includes('openid')) {
    throw new AuthConfigError('OIDC_SCOPES must contain "openid"');
  }

  const rawPublicUrl = nonEmpty(env, 'MCP_PUBLIC_URL');
  if (!rawPublicUrl)
    throw new AuthConfigError('MCP_PUBLIC_URL is required when OIDC_ISSUER is set');
  const publicUrlParsed = absoluteUrl('MCP_PUBLIC_URL', rawPublicUrl, production);
  if (
    publicUrlParsed.search ||
    publicUrlParsed.hash ||
    publicUrlParsed.username ||
    publicUrlParsed.password
  ) {
    throw new AuthConfigError('MCP_PUBLIC_URL must not contain credentials, a query or a fragment');
  }
  const publicUrl = publicUrlParsed.toString().replace(/\/+$/, '');

  const rawSecret = nonEmpty(env, 'JWT_SECRET');
  if (!rawSecret) throw new AuthConfigError('JWT_SECRET is required when OIDC_ISSUER is set');
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(rawSecret)) {
    throw new AuthConfigError('JWT_SECRET must be base64 encoded');
  }
  const jwtSecret = new Uint8Array(Buffer.from(rawSecret, 'base64'));
  if (jwtSecret.byteLength < 32) {
    throw new AuthConfigError(
      'JWT_SECRET must decode to at least 32 bytes (e.g. `openssl rand -base64 32`)',
    );
  }

  const clientSecret = nonEmpty(env, 'OIDC_CLIENT_SECRET');
  return {
    publicUrl,
    resource: publicUrl + '/mcp',
    jwtSecret,
    production,
    oidc: {
      issuer,
      clientId,
      ...(clientSecret ? { clientSecret } : {}),
      scopes,
      buttonLabel: nonEmpty(env, 'OIDC_BUTTON_LABEL') ?? 'Sign in with single sign-on',
      redirectUri: publicUrl + '/oidc/callback',
    },
  };
}
