# Skosmos REST API Analysis

## Overview

The Skosmos REST API (v1) is a JSON-LD API for navigating SKOS (Simple Knowledge Organization System) vocabularies. This document analyzes its endpoints, response structures, and how they map to MCP tools.

## Base URL

```
{SKOSMOS_BASE_URL}/rest/v1
```

---

## Endpoint Descriptions

### Global Endpoints

| Endpoint | Description |
|---|---|
| `GET /vocabularies` | Lists all vocabularies. Returns id, title, languages. |
| `GET /search` | Global full-text search with wildcard support. |
| `GET /label` | Resolves a concept URI to its labels. |
| `GET /data` | Returns raw RDF data for a URI. |
| `GET /types` | Lists all concept types across vocabularies. |

### Vocabulary Endpoints

| Endpoint | Description |
|---|---|
| `GET /{vocid}/` | Vocabulary metadata (title, languages, concept schemes). |
| `GET /{vocid}/topConcepts` | Root concepts for the vocabulary. |
| `GET /{vocid}/search` | Search within a single vocabulary. |
| `GET /{vocid}/lookup` | Find concept URI by label text. |
| `GET /{vocid}/label` | Get labels for a concept URI. |
| `GET /{vocid}/broader` | Direct parent concepts (skos:broader). |
| `GET /{vocid}/broaderTransitive` | All ancestors (skos:broaderTransitive). |
| `GET /{vocid}/narrower` | Direct child concepts (skos:narrower). |
| `GET /{vocid}/narrowerTransitive` | All descendants (skos:narrowerTransitive). |
| `GET /{vocid}/related` | Related concepts (skos:related). |
| `GET /{vocid}/children` | Children in hierarchy tree (similar to narrower). |
| `GET /{vocid}/hierarchy` | Path to root + siblings for tree navigation. |
| `GET /{vocid}/groups` | Concept groups (skos:Collection). |
| `GET /{vocid}/groupMembers` | Members of a concept group. |
| `GET /{vocid}/mappings` | Cross-vocabulary SKOS mappings. |
| `GET /{vocid}/vocabularyStatistics` | Concept and label counts. |
| `GET /{vocid}/labelStatistics` | Label counts per language. |
| `GET /{vocid}/index/` | Alphabetical index letters. |
| `GET /{vocid}/index/{letter}` | Concepts by first letter. |
| `GET /{vocid}/new` | Newly added concepts. |
| `GET /{vocid}/modified` | Recently modified concepts. |

---

## Response Examples

### GET /vocabularies

```json
{
  "@context": "...",
  "vocabularies": [
    {
      "id": "yso",
      "title": "YSO - General Finnish Ontology",
      "defaultLanguage": "fi",
      "languages": ["fi", "en", "sv"],
      "type": ["skos:ConceptScheme"]
    }
  ]
}
```

### GET /{vocid}/search?query=water

```json
{
  "results": [
    {
      "uri": "http://www.yso.fi/onto/yso/p8966",
      "prefLabel": "water",
      "type": ["skos:Concept"],
      "vocab": "yso",
      "lang": "en"
    }
  ]
}
```

### GET /{vocid}/broader?uri=...

```json
{
  "uri": "http://www.yso.fi/onto/yso/p8966",
  "broader": [
    {
      "uri": "http://www.yso.fi/onto/yso/p123",
      "prefLabel": "natural resources"
    }
  ]
}
```

### GET /{vocid}/hierarchy?uri=...

```json
{
  "broaderTransitive": {
    "http://www.yso.fi/onto/yso/p8966": {
      "uri": "http://www.yso.fi/onto/yso/p8966",
      "prefLabel": "water",
      "broader": ["http://www.yso.fi/onto/yso/p123"],
      "narrower": [
        { "uri": "http://www.yso.fi/onto/yso/p999", "prefLabel": "drinking water" }
      ]
    }
  }
}
```

---

## Assumptions

1. All endpoints return `application/json` or `application/ld+json`. The MCP client sends `Accept: application/json`.
2. The `/@context` field in responses is JSON-LD context and can be ignored for MCP purposes.
3. Vocabulary `id` corresponds to the `{vocid}` path segment.
4. The `broaderTransitive` and `narrowerTransitive` endpoints return a flat map keyed by URI — not a nested tree.
5. The `/hierarchy` endpoint returns the broader chain plus direct children for tree widgets.
6. Labels default to the vocabulary's default language when no `lang` is specified.
7. The `/lookup` endpoint does exact and fuzzy label matching (implementation-dependent).
8. Wildcards in search (`*`) are supported at the end of query strings.

---

## REST → MCP Tool Mapping

| MCP Tool | REST Endpoint(s) | Notes |
|---|---|---|
| `list_vocabularies` | `GET /vocabularies` | Direct mapping |
| `get_vocabulary` | `GET /{vocid}/` + `GET /{vocid}/topConcepts` | Combines both |
| `get_concept` | `GET /{vocid}/label` + `broader` + `narrower` + `related` | Aggregates 4 calls |
| `get_concept_label` | `GET /{vocid}/label` | Direct mapping |
| `concept_path` | `GET /{vocid}/hierarchy` | Returns full path to root |
| `search_concepts` | `GET /search` or `GET /{vocid}/search` | Routes by vocab param |
| `autocomplete` | `GET /search` or `GET /{vocid}/search` | Uses `unique=true`, appends `*` |
| `resolve_label` | `GET /{vocid}/lookup` | Direct mapping |
| `labels` | `GET /{vocid}/label` | Same as get_concept_label |
| `broader_concepts` | `GET /{vocid}/broader` (BFS loop) | BFS traversal |
| `narrower_concepts` | `GET /{vocid}/narrower` (BFS loop) | BFS traversal |
| `related_concepts` | `GET /{vocid}/related` (BFS loop) | BFS traversal |
| `traverse_concepts` | `GET /{vocid}/broader/narrower/related` (BFS loop) | Mixed BFS |

---

## MCP Resources

| Resource URI | REST Source | Description |
|---|---|---|
| `skosmos://vocabularies` | `GET /vocabularies` | All vocabularies |
| `skosmos://{vocid}` | `GET /{vocid}/` | Vocabulary metadata |
| `skosmos://{vocid}/{encodedUri}` | Multiple concept endpoints | Full concept data |

---

## API Limitations

1. **No batch concept retrieval**: Concepts must be fetched one at a time; BFS traversal requires N+1 HTTP calls.
2. **Transitive endpoints are server-side**: `broaderTransitive` and `narrowerTransitive` are available but we use our own BFS to have configurable depth control.
3. **No authentication**: The Skosmos API is typically public; credentials are not supported in this implementation.
4. **Language fallback**: When a requested language has no label, the API may return the default language label or nothing.
5. **Rate limiting**: No standard rate limiting mechanism is documented; rely on retry logic for 5xx errors.
6. **Wildcard search**: Only trailing wildcards (`prefix*`) are documented; other patterns may not work on all instances.
7. **URI encoding**: Concept URIs passed as query parameters must be URL-encoded.
8. **Vocabulary-scoped operations**: Most concept operations require knowing the vocabulary ID.

---

## Architecture Overview

```
MCP Client (AI)
    │
    │  stdio (JSON-RPC)
    ▼
skosmos-mcp server (Node.js)
    │
    ├── McpServer (SDK)
    │   ├── 13 Tools
    │   └── 3 Resources
    │
    ├── TraversalEngine (BFS)
    │   └── depth-capped, cycle-detected BFS
    │
    ├── CacheManager (TTL in-memory)
    │   └── vocabularies, vocabulary, labels, search, traversal
    │
    └── SkosmosClient
        └── fetch() with retry + timeout
            │
            ▼
        Skosmos REST API
```
