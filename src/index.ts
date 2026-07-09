#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config/index.js';
import { SkosmosClient } from './api/client.js';
import { CacheManager } from './cache/index.js';
import { TraversalEngine } from './traversal/engine.js';
import { createServer } from './server/index.js';
import { logger } from './util/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info('Starting skosmos-mcp server', {
    baseUrl: config.baseUrl,
    defaultLanguage: config.defaultLanguage,
    maxTraversalDepth: config.maxTraversalDepth,
  });

  const client = new SkosmosClient(config);
  const cacheManager = new CacheManager(config.cacheTtl);
  const traversalEngine = new TraversalEngine(client, config);
  const server = createServer(config, client, traversalEngine, cacheManager);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('skosmos-mcp server connected via stdio');
}

main().catch((err) => {
  process.stderr.write(
    JSON.stringify({ level: 'error', message: 'Fatal error', error: String(err) }) + '\n',
  );
  process.exit(1);
});
