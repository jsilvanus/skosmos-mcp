import * as client from 'openid-client';
import type { OidcConfig } from './config.js';

export interface OidcAuthorizationRequest {
  url: URL;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
  name?: string;
  email?: string;
}

/**
 * OIDC Relying Party toward the configured IdP (e.g. authentik). This server never issues ID
 * tokens itself; it only sends the browser to the IdP and verifies what comes back.
 */
export class OidcRelyingParty {
  private configuration: Promise<client.Configuration> | undefined;

  constructor(
    private readonly config: OidcConfig,
    private readonly production: boolean,
  ) {}

  /** Discovery runs lazily on first use; a failure drops the cached promise so the next request retries. */
  private discover(): Promise<client.Configuration> {
    if (!this.configuration) {
      const issuer = new URL(this.config.issuer);
      const auth = this.config.clientSecret
        ? client.ClientSecretBasic(this.config.clientSecret)
        : client.None();
      const insecure = issuer.protocol === 'http:' && !this.production;
      this.configuration = client
        .discovery(
          issuer,
          this.config.clientId,
          undefined,
          auth,
          insecure ? { execute: [client.allowInsecureRequests] } : undefined,
        )
        .catch((err: unknown) => {
          this.configuration = undefined;
          throw err;
        });
    }
    return this.configuration;
  }

  async authorizationRequest(): Promise<OidcAuthorizationRequest> {
    const configuration = await this.discover();
    const codeVerifier = client.randomPKCECodeVerifier();
    const state = client.randomState();
    const nonce = client.randomNonce();
    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes,
      response_type: 'code',
      code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url, state, nonce, codeVerifier };
  }

  /** Exchanges the code (PKCE + state + nonce checks, ID token required) and returns the IdP identity. */
  async callback(
    currentUrl: URL,
    checks: { state: string; nonce: string; codeVerifier: string },
  ): Promise<OidcIdentity> {
    const configuration = await this.discover();
    const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
      pkceCodeVerifier: checks.codeVerifier,
      expectedState: checks.state,
      expectedNonce: checks.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims || typeof claims.sub !== 'string' || !claims.sub) {
      throw new Error('ID token has no subject');
    }
    let profile: Record<string, unknown> = claims;
    if (typeof claims['email'] !== 'string' && configuration.serverMetadata().userinfo_endpoint) {
      try {
        profile = {
          ...(await client.fetchUserInfo(configuration, tokens.access_token, claims.sub)),
          ...claims,
        };
      } catch {
        // The profile is only used for display; the identity comes from the verified ID token.
      }
    }
    const pick = (key: string) =>
      typeof profile[key] === 'string' && profile[key] ? (profile[key] as string) : undefined;
    const name = pick('name') ?? pick('preferred_username') ?? pick('email');
    const email = pick('email');
    return {
      issuer: claims.iss,
      subject: claims.sub,
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
    };
  }
}
