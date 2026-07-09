#!/usr/bin/env node
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { loadConfig } from './config/index.js';
import { SkosmosClient } from './api/client.js';
import { CacheManager } from './cache/index.js';
import { TraversalEngine } from './traversal/engine.js';
import { createServer } from './server/index.js';
import { logger } from './util/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info('Starting skosmos-mcp HTTP server', {
    baseUrl: config.baseUrl,
    defaultLanguage: config.defaultLanguage,
    maxTraversalDepth: config.maxTraversalDepth,
    httpHost: config.httpHost,
    httpPort: config.httpPort,
  });

  const client = new SkosmosClient(config);
  const cacheManager = new CacheManager(config.cacheTtl);
  const traversalEngine = new TraversalEngine(client, config);

  const app = createMcpExpressApp({ host: config.httpHost });

  app.post('/mcp', async (req: IncomingMessage, res: ServerResponse) => {
    const server = createServer(config, client, traversalEngine, cacheManager);
    // Stateless mode: no sessionIdGenerator
    const transport = new StreamableHTTPServerTransport({});
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, (req as { body?: unknown }).body);
  });

  app.get('/mcp', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
    );
  });

  app.delete('/mcp', (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }),
    );
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
