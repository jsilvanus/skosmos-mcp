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
  serverUrl?: string,
): SkosmosClient {
  if (serverUrl && config.toolServerUrlAllowed) {
    return client.withBaseUrl(serverUrl);
  }
  return client;
}
