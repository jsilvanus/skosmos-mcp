# REST vs MCP Parity

Source: https://api.finto.fi/rest/v1/swagger.json
- Swagger download date: 2026-07-09
- Comparison created: 2026-07-09

This table lists the public REST endpoints declared by the Skosmos REST API (swagger.json) and whether equivalent functionality is provided by this repository's MCP implementation (`/mcp` JSON-RPC tools and resources).

| REST Path | Method | Present in MCP | MCP mapping (tool / resource) | Notes |
|---|---:|---:|---|---|
| /vocabularies | GET | Yes | `list_vocabularies` (tool), `vocabularies` (resource) | Returns vocabulary list as JSON |
| /search | GET | Yes | `search_concepts` (tool) | Global search; tool accepts optional `vocabulary` param |
| /label | GET | Partial | `get_concept_label` / `labels` (tools) | REST uses `uri` query param; MCP tool requires `vocabulary` (or uses defaults) |
| /data | GET | No | - | REST returns RDF serializations (turtle, rdf+xml, etc.). MCP exposes JSON summaries, not raw RDF serialization.
| /types | GET | No | - | No direct `types` tool implemented; type information may be available via `get_vocabulary` result depending on Skosmos server responses.
| /{vocid}/ | GET | Yes (partial) | `get_vocabulary` (tool), `vocabulary` (resource) | MCP returns vocabulary info + top concepts via `get_vocabulary` tool and `vocabulary` resource returns JSON |
| /{vocid}/types | GET | No | - | No explicit tool for vocabulary-scoped types
| /{vocid}/topConcepts | GET | Partial | `get_vocabulary` (tool) | `get_vocabulary` returns `topConcepts` along with vocabulary info
| /{vocid}/data | GET | No | - | REST returns RDF for whole vocabulary or concept; not provided by MCP
| /{vocid}/search | GET | Yes | `search_concepts` (tool) | Tool supports `vocabulary` parameter to limit search to a vocabulary
| /{vocid}/lookup | GET | Yes | `resolve_label` (tool) | REST `lookup` -> MCP `resolve_label`/`lookup` via `resolve_label` which calls Skosmos lookup
| /{vocid}/vocabularyStatistics | GET | No | - | No explicit statistics tool implemented
| /{vocid}/labelStatistics | GET | No | - | No explicit label statistics tool implemented
| /{vocid}/index/ | GET | No | - | Alphabetical index endpoints not implemented as explicit tools/resources
| /{vocid}/index/{letter} | GET | No | - | Not implemented
| /{vocid}/label | GET | Yes (partial) | `get_concept_label` / `labels` (tools) | MCP provides label retrieval but may require `vocabulary` param
| /{vocid}/broader | GET | Yes | `broader_concepts` (tool) | Maps to `getBroader` behavior via traversal tools
| /{vocid}/broaderTransitive | GET | Yes | `broader_concepts` or `traverse_concepts` (tools) | `traverse_concepts` and traversal tools provide transitive traversals
| /{vocid}/narrower | GET | Yes | `narrower_concepts` (tool) | |
| /{vocid}/narrowerTransitive | GET | Yes | `narrower_concepts` or `traverse_concepts` (tools) | traversal tools support depth/transitive traversal
| /{vocid}/related | GET | Yes | `related_concepts` (tool) | |
| /{vocid}/children | GET | Partial | `narrower_concepts` / resource `concept` | `concept` resource composes narrower children; traversal tools produce hierarchical data
| /{vocid}/groups | GET | No | - | No explicit groups tool implemented
| /{vocid}/new | GET | No | - | No explicit "new concepts" tool
| /{vocid}/modified | GET | No | - | No explicit "modified concepts" tool
| /{vocid}/groupMembers | GET | No | - | Not implemented
| /{vocid}/hierarchy | GET | Yes (partial) | `concept_path` (tool) and traversal tools | `concept_path` uses Skosmos hierarchy; traversal can build hierarchical context
| /{vocid}/mappings | GET | Partial | No dedicated tool; client supports mappings | There is no dedicated `mappings` tool registered; the low-level `SkosmosClient` supports mappings but MCP does not expose it as a tool/resource currently

Notes:
- "Yes (partial)" means equivalent data or functionality is available via MCP tools/resources but parameter shapes, output formats, or required parameters may differ from the REST API.
- The MCP in this repository exposes a single HTTP entrypoint: `/mcp` (JSON-RPC over POST). The REST API endpoints above are served by Skosmos servers; MCP provides equivalent operations as JSON-RPC tools and some static/dynamic resources (e.g., `skosmos://vocabularies`, `skosmos://{vocid}`, `skosmos://{vocid}/{encodedUri}`).
- REST endpoints that return RDF serializations (e.g., `/data`, `/{vocid}/data`) are not exposed by MCP; MCP returns JSON text payloads (stringified JSON) in tool `content` fields.

If you want, I can:
- Add missing tools/resources that map to specific REST endpoints (e.g., `data`, `vocabularyStatistics`, `labelStatistics`, indexing) as follow-up work.
- Produce a machine-readable CSV of this table.
