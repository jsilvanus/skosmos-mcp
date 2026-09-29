import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Express, RequestHandler } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Config } from './config/index.js';
import { SkosmosClient } from './api/client.js';
import { CacheManager } from './cache/index.js';
import { TraversalEngine } from './traversal/engine.js';
import { createServer } from './server/index.js';
import type { AuthConfig } from './auth/config.js';
import { mountAuth, type AuthOptions } from './auth/router.js';

export interface HttpAppOptions {
  /** OAuth + OIDC sign-in; undefined (OIDC_ISSUER unset) = `/mcp` is open, as before. */
  auth?: AuthConfig;
  authOptions?: AuthOptions;
  /** Express `trust proxy` setting (MCP_TRUST_PROXY), used for per-IP rate limiting. */
  trustProxy?: boolean | number | string;
}

/** Builds the Express app without listening, so tests can run it on an ephemeral port. */
export function createHttpApp(config: Config, options: HttpAppOptions = {}): Express {
  const client = new SkosmosClient(config);
  const cacheManager = new CacheManager(config.cacheTtl);
  const traversalEngine = new TraversalEngine(client, config);

  const app = createMcpExpressApp({ host: config.httpHost }) as Express;
  if (options.trustProxy !== undefined) app.set('trust proxy', options.trustProxy);

  const requireAuth: RequestHandler[] = options.auth
    ? [mountAuth(app, options.auth, options.authOptions)]
    : [];

  app.post('/mcp', ...requireAuth, async (req: IncomingMessage, res: ServerResponse) => {
    const server = createServer(config, client, traversalEngine, cacheManager);
    // Stateless mode: no sessionIdGenerator
    const transport = new StreamableHTTPServerTransport({});
    await server.connect(transport as unknown as Transport);
    // req.body is populated by the express.json() middleware in createMcpExpressApp
    await transport.handleRequest(req, res, (req as { body?: unknown }).body);
  });

  app.get('/mcp', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      }),
    );
  });

  app.delete('/mcp', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null,
      }),
    );
  });

  return app;
}

/** Parses MCP_TRUST_PROXY: unset = Express default (off); true/false; a hop count; or an address list. */
export function parseTrustProxy(value: string | undefined): boolean | number | string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
