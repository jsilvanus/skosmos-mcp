# skosmos-mcp

A production-quality [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that wraps the [Skosmos](https://skosmos.org/) REST API, enabling AI assistants to navigate and query SKOS vocabularies. Also includes SPARQL query capabilities for direct RDF data access.

---

## Features

- **13 MCP tools** covering vocabulary browsing, concept lookup, full-text search, label resolution, and BFS traversal
- **4 SPARQL tools** for direct SPARQL query execution, updates, graph discovery, and query templates
- **3 MCP resources** for direct URI-based access to vocabularies and concepts
- **BFS traversal engine** with configurable depth cap, cycle detection, and duplicate elimination
- **TTL-based in-memory cache** to avoid redundant API calls
- **Retry logic** with exponential backoff for 5xx and network errors
- **AbortController timeout** on every HTTP request
- **Strict TypeScript** (strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **Zod-validated inputs** on all tools
- **stdio transport** — reads from stdin, writes to stdout; all logging goes to stderr
- **StreamableHTTP transport** — HTTP server at `/mcp` for remote or web-based MCP clients

---

## Installation

```bash
npm install
npm run build
```

Or run directly with tsx:

```bash
npm run dev
```

### Docker / Docker Compose

Build and run the Streamable HTTP MCP server in a container:

```bash
docker compose up --build -d
```

This starts the Streamable HTTP MCP server on port `3000` and uses Docker Compose's `restart: unless-stopped` policy so it will come back up automatically after crashes. The image defaults to the Finto endpoints, runs the HTTP MCP server on `0.0.0.0:3000`, and enables alternate Skosmos/SPARQL connections by default. The container logs a warning at startup when those options are enabled because allowing other endpoints can be a security risk. The container reads the same environment variables as the local app, so copy `.env.example` to `.env` if you want to override those defaults.

Releases also publish a container image to GitHub Container Registry via GitHub Actions. The workflow builds the image from the Dockerfile and pushes it with the release tag plus `latest` for the default branch.

---

## Configuration

Copy `.env.example` to `.env` and fill in values:

```env
SKOSMOS_BASE_URL=https://api.finto.fi    # required
SKOSMOS_DEFAULT_VOCABULARY=                      # optional
SKOSMOS_DEFAULT_LANGUAGE=en
SKOSMOS_TIMEOUT=30000
SKOSMOS_USER_AGENT=skosmos-mcp/0.2.0
SKOSMOS_CACHE_TTL=300
SKOSMOS_MAX_TRAVERSAL_DEPTH=5
SKOSMOS_TOOL_SERVER_URL_ALLOWED=true

# SPARQL Configuration (optional)
SPARQL_ENDPOINT_URL=https://api.finto.fi/sparql
SPARQL_USERNAME=
SPARQL_PASSWORD=
SPARQL_ALLOW_OTHER_ENDPOINTS=true
```

| Variable | Default | Description |
|---|---|---|
| `SKOSMOS_BASE_URL` | *(required)* | Base URL of the Skosmos instance |
| `SKOSMOS_DEFAULT_VOCABULARY` | — | Default vocabulary id when not specified in a tool call |
| `SKOSMOS_DEFAULT_LANGUAGE` | `en` | Default language code for labels |
| `SKOSMOS_TIMEOUT` | `30000` | HTTP request timeout in milliseconds |
| `SKOSMOS_USER_AGENT` | `skosmos-mcp/0.1.0` | User-Agent header sent with API requests |
| `SKOSMOS_CACHE_TTL` | `300` | Cache entry TTL in seconds |
| `SKOSMOS_MAX_TRAVERSAL_DEPTH` | `3` | Hard cap on BFS traversal depth |
| `SKOSMOS_TOOL_SERVER_URL_ALLOWED` | `false` | When `true`, allows tools to accept optional `server_url` parameter to call a different Skosmos instance |
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error (written to stderr) |
| `MCP_HTTP_PORT` | `3000` | TCP port for the StreamableHTTP server |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address for the StreamableHTTP server |
| `SPARQL_ENDPOINT_URL` | — | SPARQL endpoint URL (optional; enables SPARQL tools) |
| `SPARQL_USERNAME` | — | Username for SPARQL endpoint HTTP Basic auth (optional) |
| `SPARQL_PASSWORD` | — | Password for SPARQL endpoint HTTP Basic auth (optional) |
| `SPARQL_ALLOW_OTHER_ENDPOINTS` | `false` | When `true`, allows SPARQL tools to accept optional `endpoint` parameter to query a different SPARQL endpoint |

---

## MCP Tools Reference

### Vocabulary Tools

#### `list_vocabularies`
List all available vocabularies.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `lang` | string | no | Language code for labels |

#### `get_vocabulary`
Get vocabulary metadata and top concepts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Vocabulary identifier (e.g. `"yso"`) |
| `lang` | string | no | Language code |

---

### Concept Tools

#### `get_concept`
Fetch full concept details: labels, broader, narrower, related.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Concept URI |
| `vocabulary` | string | no | Vocabulary identifier (required if no default set) |
| `lang` | string | no | Language code |

#### `get_concept_label`
Get all labels for a concept URI.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Concept URI |
| `vocabulary` | string | yes | Vocabulary identifier |
| `lang` | string | no | Language code |

#### `concept_path`
Get the hierarchy path from a concept to its root.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Concept URI |
| `vocabulary` | string | yes | Vocabulary identifier |
| `lang` | string | no | Language code |

---

### Search Tools

#### `search_concepts`
Full-text search across one or all vocabularies.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search string (supports trailing `*` wildcard) |
| `vocabulary` | string | no | Limit to this vocabulary |
| `lang` | string | no | Language code |
| `maxhits` | integer | no | Max results |
| `offset` | integer | no | Pagination offset |

#### `autocomplete`
Autocomplete concept labels by prefix.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `prefix` | string | yes | Label prefix |
| `vocabulary` | string | no | Limit to this vocabulary |
| `lang` | string | no | Language code |
| `maxhits` | integer | no | Max suggestions |

#### `resolve_label`
Resolve a label text to concept URIs.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Label text to resolve |
| `vocabulary` | string | yes | Vocabulary identifier |
| `lang` | string | no | Language code |

---

### Labels Tool

#### `labels`
Get all labels (prefLabel, altLabel, hiddenLabel) for a concept URI.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Concept URI |
| `vocabulary` | string | yes | Vocabulary identifier |
| `lang` | string | no | Language code |

---

### Traversal Tools

All traversal tools use BFS with cycle detection. Depth is capped at `Math.min(depth, SKOSMOS_MAX_TRAVERSAL_DEPTH)`.

#### `broader_concepts`
Traverse broader (parent) concepts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Starting concept URI |
| `vocabulary` | string | yes | Vocabulary identifier |
| `depth` | integer | no | Max traversal depth |
| `lang` | string | no | Language code |

#### `narrower_concepts`
Traverse narrower (child) concepts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Starting concept URI |
| `vocabulary` | string | yes | Vocabulary identifier |
| `depth` | integer | no | Max traversal depth |
| `lang` | string | no | Language code |

#### `related_concepts`
Traverse related concepts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Starting concept URI |
| `vocabulary` | string | yes | Vocabulary identifier |
| `depth` | integer | no | Max traversal depth |
| `lang` | string | no | Language code |

#### `traverse_concepts`
BFS using a mix of relationship types.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `uri` | URL | yes | Starting concept URI |
| `vocabulary` | string | yes | Vocabulary identifier |
| `relationships` | array | yes | One or more of: `"broader"`, `"narrower"`, `"related"` |
| `depth` | integer | no | Max traversal depth |
| `lang` | string | no | Language code |

---

### SPARQL Tools

SPARQL tools enable direct querying of RDF data. Set `SPARQL_ENDPOINT_URL` environment variable to enable these tools. Supports both SPARQL 1.1 Query and Update protocols, with optional HTTP Basic authentication.

#### `execute_sparql_query`
Execute a SPARQL query (SELECT, CONSTRUCT, ASK, DESCRIBE) against the configured endpoint.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The SPARQL query to execute |
| `endpoint` | URL | no | Optional custom SPARQL endpoint (overrides default) |

**Example Query:**
```sparql
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?concept ?label
WHERE {
  ?concept a skos:Concept ;
           skos:prefLabel ?label .
}
LIMIT 10
```

#### `execute_sparql_update`
Execute a SPARQL update query (INSERT, DELETE, etc.) against the configured endpoint.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `update` | string | yes | The SPARQL update query to execute |
| `endpoint` | URL | no | Optional custom SPARQL endpoint (overrides default) |

**Example Update:**
```sparql
PREFIX ex: <http://example.org/>
INSERT DATA {
  ex:subject1 ex:predicate1 "object1" .
}
```

#### `list_sparql_graphs`
List all available named graphs in the SPARQL endpoint.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `endpoint` | URL | no | Optional custom SPARQL endpoint (overrides default) |

**Returns:** JSON array of graph URIs.

#### `sparql_query_templates`
Get pre-built SPARQL query templates for common data exploration patterns.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | string | yes | Template category: `exploration`, `property-paths`, `statistics`, `validation`, `schema`, or `all` |

**Categories:**
- `exploration` — Basic data discovery and statistics
- `property-paths` — Complex graph navigation using SPARQL property paths
- `statistics` — Knowledge graph metrics and analysis
- `validation` — Data quality and consistency checks
- `schema` — Structure discovery and ontology exploration

---

## MCP Resources

| URI Pattern | Description |
|---|---|
| `skosmos://vocabularies` | JSON list of all vocabularies |
| `skosmos://{vocid}` | Vocabulary metadata for `{vocid}` |
| `skosmos://{vocid}/{encodedUri}` | Concept data (labels, broader, narrower, related) |

---

## Traversal Examples

### Get all ancestors of a concept (depth 3)

```json
{
  "tool": "broader_concepts",
  "args": {
    "uri": "http://www.yso.fi/onto/yso/p8966",
    "vocabulary": "yso",
    "depth": 3,
    "lang": "en"
  }
}
```

Response includes `nodes` (with depth), `edges` (directed relationships), `rootUri`, and `maxDepth`.

### Mixed traversal (broader + related)

```json
{
  "tool": "traverse_concepts",
  "args": {
    "uri": "http://www.yso.fi/onto/yso/p8966",
    "vocabulary": "yso",
    "relationships": ["broader", "related"],
    "depth": 2
  }
}
```

---

## Using Optional Server URL Parameter

All 13 MCP tools support an optional `server_url` parameter. When `SKOSMOS_TOOL_SERVER_URL_ALLOWED=true` is set in the environment, you can pass a `server_url` parameter to any tool to make it query a different Skosmos instance instead of the configured `SKOSMOS_BASE_URL`.

### Example: Query a different Skosmos instance

```json
{
  "tool": "get_concept",
  "args": {
    "uri": "http://www.yso.fi/onto/yso/p8966",
    "vocabulary": "yso",
    "lang": "en",
    "server_url": "https://alternative-skosmos.example.org"
  }
}
```

This allows a single MCP session to interact with multiple Skosmos instances. The `server_url` parameter is:
- **Optional** on all tools
- **Ignored** unless `SKOSMOS_TOOL_SERVER_URL_ALLOWED=true` (default: `false`)
- Can be any valid URL pointing to a Skosmos instance with a compatible REST API

### Why use this feature?

- Query multiple Skosmos instances in parallel within a single session
- Test against different Skosmos servers without restarting the MCP
- Support scenarios where vocabularies are distributed across multiple instances

---

### stdio (standard MCP deployment)

```bash
SKOSMOS_BASE_URL=https://skosmos.example.org node dist/index.js
```

### StreamableHTTP

```bash
SKOSMOS_BASE_URL=https://skosmos.example.org MCP_HTTP_PORT=3000 node dist/http.js
```

The server listens on `http://<MCP_HTTP_HOST>:<MCP_HTTP_PORT>/mcp` (default: `http://127.0.0.1:3000/mcp`).
Each POST request is handled as a stateless MCP session (no session ID). The `SkosmosClient` and `CacheManager` instances are shared across requests for the lifetime of the process.

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "skosmos": {
      "command": "node",
      "args": ["/path/to/skosmos-mcp/dist/index.js"],
      "env": {
        "SKOSMOS_BASE_URL": "https://skosmos.example.org",
        "SKOSMOS_DEFAULT_LANGUAGE": "en"
      }
    }
  }
}
```

---

## Development

```bash
npm run dev          # run with tsx (no build)
npm run typecheck    # check types without emitting
npm run test         # run tests
npm run test:watch   # watch mode
npm run build        # compile to dist/
npm run lint         # lint src/ and tests/
```

---

## Architecture

```
MCP Client (AI Assistant)
       │ stdio (JSON-RPC)
       ▼
 McpServer (SDK)
  ├── 13 Tools (Zod-validated)
  └── 3 Resources
       │
  ┌────┴────┐
  │         │
TraversalEngine   CacheManager
(BFS + cycle     (TTL, per-type)
 detection)
       │
  SkosmosClient
  (fetch + retry
   + timeout)
       │
  Skosmos REST API
```

### Key Design Decisions

- **No global mutable state**: config, client, cache, and traversal engine are created once in `src/index.ts` and passed via dependency injection.
- **BFS traversal**: uses a queue (not recursion) to ensure breadth-first ordering and avoid stack overflows.
- **Depth capping**: `Math.min(requestedDepth, config.maxTraversalDepth)` is applied in both the traversal engine and tool handlers.
- **Cache keys** include all relevant parameters: `vocabulary:${vocid}:${lang}`, `label:${vocab}:${uri}:${lang}`, etc.
- **All logging to stderr** — stdout is reserved exclusively for MCP JSON-RPC.

---

## License

MIT
