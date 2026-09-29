import { createHash, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/**
 * All tokens this server issues are HS256 JWTs signed with JWT_SECRET. They are kept apart by
 * audience and `typ`, so one kind can never be used as another:
 *
 * - access token:  aud = <publicUrl>/mcp,             typ absent (as in the codestash scaffold)
 * - refresh token: aud = <publicUrl>/oauth/token,     typ = refresh
 * - login ticket:  aud = <publicUrl>/oauth/authorize, typ = login
 *
 * The subject is the IdP identity: `sub` is the IdP subject and `idp_iss` the IdP issuer.
 */

export interface Identity {
  /** OIDC issuer the identity comes from. */
  issuer: string;
  /** The IdP's `sub`. */
  subject: string;
  /** Display name (for the consent page only). */
  name?: string;
}

export const ACCESS_TOKEN_TTL_SECONDS = 3600;
const REFRESH_TOKEN_TTL = '30d';
const LOGIN_TICKET_TTL = '10m';

export const oauthHash = (oauth: string) => createHash('sha256').update(oauth).digest('base64url');

export class TokenService {
  private readonly ticketAudience: string;
  private readonly refreshAudience: string;

  constructor(
    private readonly secret: Uint8Array,
    private readonly issuer: string,
    private readonly resource: string,
  ) {
    this.ticketAudience = issuer + '/oauth/authorize';
    this.refreshAudience = issuer + '/oauth/token';
  }

  issueAccessToken(identity: Identity, clientId: string, scope: string): Promise<string> {
    return new SignJWT({ client_id: clientId, scope, idp_iss: identity.issuer })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(identity.subject)
      .setIssuer(this.issuer)
      .setAudience(this.resource)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string) {
    const { payload } = await jwtVerify(token, this.secret, {
      algorithms: ['HS256'],
      issuer: this.issuer,
      audience: this.resource,
    });
    if (
      payload.typ !== undefined ||
      typeof payload.sub !== 'string' ||
      typeof payload.idp_iss !== 'string'
    ) {
      throw new Error('Not an access token');
    }
    return payload;
  }

  /**
   * Refresh tokens are self-contained (no server-side store), so they survive restarts of this
   * stateless server. They are revoked by rotating JWT_SECRET or by changing OIDC_ISSUER.
   */
  issueRefreshToken(identity: Identity, clientId: string, scope: string): Promise<string> {
    return new SignJWT({ typ: 'refresh', client_id: clientId, scope, idp_iss: identity.issuer })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(identity.subject)
      .setIssuer(this.issuer)
      .setAudience(this.refreshAudience)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(REFRESH_TOKEN_TTL)
      .sign(this.secret);
  }

  async verifyRefreshToken(
    token: string,
  ): Promise<{ identity: Identity; clientId: string; scope: string } | undefined> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.refreshAudience,
      });
      if (
        payload.typ !== 'refresh' ||
        typeof payload.sub !== 'string' ||
        typeof payload.idp_iss !== 'string' ||
        typeof payload.client_id !== 'string' ||
        typeof payload.scope !== 'string'
      ) {
        return undefined;
      }
      return {
        identity: { issuer: payload.idp_iss, subject: payload.sub },
        clientId: payload.client_id,
        scope: payload.scope,
      };
    } catch {
      return undefined;
    }
  }

  /** Signed, short-lived proof that the user signed in (via OIDC) for this authorization request. */
  issueLoginTicket(identity: Identity, oauth: string): Promise<string> {
    return new SignJWT({
      typ: 'login',
      oauth: oauthHash(oauth),
      idp_iss: identity.issuer,
      ...(identity.name ? { name: identity.name } : {}),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(identity.subject)
      .setIssuer(this.issuer)
      .setAudience(this.ticketAudience)
      .setIssuedAt()
      .setExpirationTime(LOGIN_TICKET_TTL)
      .sign(this.secret);
  }

  async verifyLoginTicket(ticket: string, oauth: string): Promise<Identity | undefined> {
    try {
      const { payload } = await jwtVerify(ticket, this.secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.ticketAudience,
      });
      if (
        payload.typ !== 'login' ||
        payload.oauth !== oauthHash(oauth) ||
        typeof payload.sub !== 'string' ||
        typeof payload.idp_iss !== 'string'
      ) {
        return undefined;
      }
      return {
        issuer: payload.idp_iss,
        subject: payload.sub,
        ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
      };
    } catch {
      return undefined;
    }
  }
}
