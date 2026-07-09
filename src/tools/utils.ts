import type { SkosmosClient } from '../api/client.js';
import type { Config } from '../config/index.js';

/**
 * Returns a client instance to use for API calls, potentially with a different base URL.
 * If server_url is provided and allowed by config, creates a new client with that URL.
 * Otherwise, returns the default client.
 */
export function getClient(
  client: SkosmosClient,
  config: Config,
  server_url?: string,
): SkosmosClient {
  if (server_url && config.toolServerUrlAllowed) {
    return client.withBaseUrl(server_url);
  }
  return client;
}
