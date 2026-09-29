# skosmos-mcp

A production-quality [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that wraps the [Skosmos](https://skosmos.org/) REST API, enabling AI assistants to navigate and query SKOS vocabularies. Also includes SPARQL query capabilities for direct RDF data access.

---

## Features

- **17 MCP tools** covering vocabulary browsing, concept lookup, full-text search, label resolution, BFS traversal, and schema-guided assistance
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

#### Container Images from GitHub Container Registry

Releases publish two container image variants to [GitHub Container Registry (GHCR)](https://docs.github.com/en/packages/working-with-a-package-registry/working-with-the-container-registry):

**HTTP variant** (for remote access via HTTP):
```bash
docker pull ghcr.io/jsilvanus/skosmos-mcp:http
docker pull ghcr.io/jsilvanus/skosmos-mcp:http-latest
# Or use a specific release version:
docker pull ghcr.io/jsilvanus/skosmos-mcp:v0.2.1-http
```

**Stdio variant** (for local stdio MCP protocol):
```bash
docker pull ghcr.io/jsilvanus/skosmos-mcp:stdio
docker pull ghcr.io/jsilvanus/skosmos-mcp:stdio-latest
# Or use a specific release version:
docker pull ghcr.io/jsilvanus/skosmos-mcp:v0.2.1-stdio
```

Each release publishes both variants automatically. Choose the one that matches your use case:
- **HTTP variant**: Runs an HTTP server on port 3000, suitable for remote access or web-based MCP clients
- **Stdio variant**: Uses stdin/stdout for the MCP protocol, suitable for local integration with AI assistants or other MCP clients

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

HTTP transport only — OAuth with single sign-on (see [OAuth and OIDC sign-in](#oauth-and-oidc-sign-in-http-only)). All of these are ignored while `OIDC_ISSUER` is unset, and the stdio server never reads them.

| Variable | Default | Description |
|---|---|---|
| `OIDC_ISSUER` | — | Issuer URL exactly as the IdP publishes it (authentik: `https://auth.example.org/application/o/<slug>/`, keep the trailing slash). **Unset/empty = OAuth is off and `/mcp` is open, as before.** |
| `OIDC_CLIENT_ID` | — | Required when `OIDC_ISSUER` is set |
| `OIDC_CLIENT_SECRET` | — | Set = confidential client (`client_secret_basic`); unset = public client. PKCE is always used. |
| `OIDC_SCOPES` | `openid email profile` | Must contain `openid` |
| `OIDC_BUTTON_LABEL` | `Sign in with single sign-on` | Text of the sign-in button |
| `MCP_PUBLIC_URL` | — | Required when `OIDC_ISSUER` is set. Public origin of this server, e.g. `https://skosmos-mcp.example.org`. The OAuth issuer, the MCP resource (`<MCP_PUBLIC_URL>/mcp`) and the OIDC redirect URI (`<MCP_PUBLIC_URL>/oidc/callback`) derive from it. |
| `JWT_SECRET` | — | Required when `OIDC_ISSUER` is set. Base64, at least 32 bytes (`openssl rand -base64 32`). Signs access tokens, refresh tokens and sign-in tickets; rotating it signs everybody out. |
| `MCP_TRUST_PROXY` | — | Express `trust proxy` setting (`true`, a hop count, or addresses) so the per-IP rate limit of the sign-in and token endpoints sees client IPs behind a reverse proxy |

With `NODE_ENV=production` (the default in the Docker image) `OIDC_ISSUER` and `MCP_PUBLIC_URL` must be `https:`. Invalid values stop the server at startup with a clear error. `OIDC_CREATE_USERS` and `OIDC_TRUST_EMAIL`, used by other MCP apps of this family, do not apply here: there are no local users.

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

### Assistance Tools

#### `vocabulary_schema_overview`
Summarize a vocabulary's structure with top concepts, relationship hints, and suggested tasks for AI clients.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Vocabulary identifier |
| `lang` | string | no | Language code |
| `includeTopConcepts` | boolean | no | Whether to include a top concept preview |
| `maxTopConcepts` | integer | no | Maximum number of top concept previews |

#### `query_guidance`
Return task-oriented guidance for common SKOS vocabulary workflows such as exploration, hierarchy traversal, or label resolution.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `vocabulary` | string | yes | Vocabulary identifier |
| `task` | string | no | One of `explore`, `resolve`, `hierarchy`, `related`, `search`, or `all` |

#### `reconcile_concept`
Resolve a label to one or more candidate concepts using Skosmos lookup and search.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Label text to resolve |
| `vocabulary` | string | yes | Vocabulary identifier |
| `lang` | string | no | Language code |
| `type` | string | no | Optional concept type filter |
| `maxhits` | integer | no | Maximum number of matches |

#### `suggest_sparql_templates`
Return SKOS-oriented SPARQL templates for exploration, hierarchy tracing, labels, and related concepts.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `vocabulary` | string | no | Optional vocabulary identifier to include in the response |
| `task` | string | no | One of `explore`, `hierarchy`, `labels`, `related`, or `all` |

### SPARQL Tools

SPARQL tools enable direct querying of RDF data. Set `SPARQL_ENDPOINT_URL` environment variable to enable these tools. Supports both SPARQL 1.1 Query and Update protocols, with optional HTTP Basic authentication.

See the [Attribution](#attribution) section for licensing details about the SPARQL implementation.

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

### OAuth and OIDC sign-in (HTTP only)

By default the HTTP server has no authentication. Set `OIDC_ISSUER` (plus `OIDC_CLIENT_ID`, `MCP_PUBLIC_URL` and `JWT_SECRET`) to require sign-in through your identity provider (e.g. authentik). The server then acts as:

- an **OAuth authorization server for MCP clients**, following the MCP authorization spec: CIMD client ids (the `client_id` is an `https:` URL of the client's metadata document), authorization code + S256 PKCE at `/oauth/authorize` and `/oauth/token`, refresh tokens, and JWT access tokens bound to `iss` = `MCP_PUBLIC_URL` and `aud` = `<MCP_PUBLIC_URL>/mcp`;
- an **OAuth resource server** for `/mcp`: requests without a valid access token get `401` with `WWW-Authenticate: Bearer resource_metadata="<MCP_PUBLIC_URL>/.well-known/oauth-protected-resource/mcp"`;
- an **OIDC Relying Party** toward the IdP. It never issues ID tokens and is not an OpenID Provider.

Discovery: `/.well-known/oauth-protected-resource/mcp` (RFC 9728, also at `/.well-known/oauth-protected-resource`), `/.well-known/oauth-authorization-server` and the `/.well-known/openid-configuration` alias of the same OAuth metadata.

Flow: the MCP client opens `/oauth/authorize`; the page shows a single sign-on button, which goes to `/oidc/login` and on to the IdP (state, nonce and PKCE; the state is also kept in a short-lived `skosmos_oidc` cookie against login CSRF). The IdP returns to `/oidc/callback`, the ID token is verified, and a consent page (Approve/Deny) finishes the authorization. There is no password sign-in.

There are no local user accounts: the signed-in identity is the IdP issuer + `sub`, carried in the access token (`sub`, `idp_iss`). **Who may sign in is decided by the IdP**, e.g. authentik's application bindings/policies; this server has no allow-list of its own.

State: pending sign-ins (10 min) and authorization codes (60 s) are kept in memory, as this server has no database; a restart only interrupts sign-ins in progress. Refresh tokens (30 days) and access tokens (1 hour) are self-contained signed JWTs, so they survive restarts; revoke them all by rotating `JWT_SECRET`. Run a single instance (or sticky sessions) when OIDC is on.

#### authentik setup

1. *Applications → Providers → Create → OAuth2/OpenID Provider*: client type **Confidential**, redirect URI `<MCP_PUBLIC_URL>/oidc/callback` (strict), and a **signing key** so ID tokens are RS256.
2. *Applications → Create* an application that uses this provider; bind the users/groups who may use the MCP server.
3. Copy the provider's **OpenID Configuration Issuer** (`https://auth.example.org/application/o/<slug>/`) to `OIDC_ISSUER`, and the client ID/secret to `OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`.

```bash
OIDC_ISSUER=https://auth.example.org/application/o/skosmos-mcp/ \
OIDC_CLIENT_ID=... OIDC_CLIENT_SECRET=... \
MCP_PUBLIC_URL=https://skosmos-mcp.example.org \
JWT_SECRET=$(openssl rand -base64 32) \
node dist/http.js
```

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
  ├── 17 Tools (Zod-validated)
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
- **HTTP app**: `src/http-app.ts` builds the Express app (used by `src/http.ts` and the tests). `src/auth/` holds the optional OAuth authorization/resource server and OIDC Relying Party, ported from the jsilvanus/codestash `mcp/api-connector-style` scaffold (Fastify) to Express; it is mounted only when `OIDC_ISSUER` is set. Tests run it against a fake OIDC provider (`tests/helpers/fake-oidc-provider.ts`).

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Attribution

SPARQL functionality in this project is derived from [ramuzes/mcp-jena](https://github.com/ramuzes/mcp-jena) and is used under the MIT License.
