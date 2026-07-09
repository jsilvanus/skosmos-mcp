import { z } from 'zod';

const configSchema = z.object({
  baseUrl: z.string().url(),
  defaultVocabulary: z.string().optional(),
  defaultLanguage: z.string().default('en'),
  timeout: z.number().int().positive().default(30000),
  userAgent: z.string().default('skosmos-mcp/0.1.0'),
  cacheTtl: z.number().int().nonnegative().default(300),
  maxTraversalDepth: z.number().int().positive().default(3),
  httpPort: z.number().int().positive().default(3000),
  httpHost: z.string().default('127.0.0.1'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    baseUrl: process.env['SKOSMOS_BASE_URL'],
    defaultVocabulary: process.env['SKOSMOS_DEFAULT_VOCABULARY'] || undefined,
    defaultLanguage: process.env['SKOSMOS_DEFAULT_LANGUAGE'],
    timeout: process.env['SKOSMOS_TIMEOUT']
      ? parseInt(process.env['SKOSMOS_TIMEOUT'], 10)
      : undefined,
    userAgent: process.env['SKOSMOS_USER_AGENT'],
    cacheTtl: process.env['SKOSMOS_CACHE_TTL']
      ? parseInt(process.env['SKOSMOS_CACHE_TTL'], 10)
      : undefined,
    maxTraversalDepth: process.env['SKOSMOS_MAX_TRAVERSAL_DEPTH']
      ? parseInt(process.env['SKOSMOS_MAX_TRAVERSAL_DEPTH'], 10)
      : undefined,
    httpPort: process.env['MCP_HTTP_PORT'] ? parseInt(process.env['MCP_HTTP_PORT'], 10) : undefined,
    httpHost: process.env['MCP_HTTP_HOST'],
  });
}
