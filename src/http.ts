#!/usr/bin/env node
import { loadConfig } from './config/index.js';
import { loadAuthConfig } from './auth/config.js';
import { createHttpApp, parseTrustProxy } from './http-app.js';
import { logger } from './util/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const trustProxy = parseTrustProxy(process.env['MCP_TRUST_PROXY']);
  logger.info('Starting skosmos-mcp HTTP server', {
    baseUrl: config.baseUrl,
    defaultLanguage: config.defaultLanguage,
    maxTraversalDepth: config.maxTraversalDepth,
    httpHost: config.httpHost,
    httpPort: config.httpPort,
  });

  if (config.toolServerUrlAllowed || config.sparqlAllowOtherEndpoints) {
    logger.warn('Alternate Skosmos or SPARQL endpoints are enabled; this may be a security risk.', {
      toolServerUrlAllowed: config.toolServerUrlAllowed,
      sparqlAllowOtherEndpoints: config.sparqlAllowOtherEndpoints,
    });
  }

  const auth = loadAuthConfig();
  if (auth) {
    logger.info('OAuth with OIDC sign-in is enabled; /mcp requires an access token', {
      publicUrl: auth.publicUrl,
      oidcIssuer: auth.oidc.issuer,
    });
  }

  const app = createHttpApp(config, {
    ...(auth ? { auth } : {}),
    ...(trustProxy !== undefined ? { trustProxy } : {}),
  });

  app.listen(config.httpPort, config.httpHost, () => {
    logger.info(
      `skosmos-mcp HTTP server listening on http://${config.httpHost}:${config.httpPort}/mcp`,
    );
  });
}

main().catch((err) => {
  process.stderr.write(
    JSON.stringify({ level: 'error', message: 'Fatal error', error: String(err) }) + '\n',
  );
  process.exit(1);
});
