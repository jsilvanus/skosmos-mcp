# MCP v2: tool and resource review

Status: decided and implemented on this branch. The tool and resource changes below are in the code; see "Implementation status" at the end.

Scope: the 21 tools registered in `src/server/index.ts` and the 3 resources in `src/server/resources.ts`, as of `main` at `4370f49`. The installed SDK is `@modelcontextprotocol/sdk` 1.29.0.

## Principle

- **Tools** are model-controlled. Use them for parameterised computation, search, traversal, and anything with side effects.
- **Resources** are application-controlled, read-only, and addressable by URI. Use them for stable reads, reference material, and anything a client may want to attach or browse without the model choosing to call something.
- **Prompts** are user-controlled templates. Use them for guided workflows.

Every tool description is sent on every `tools/list`, so long reference text belongs in a resource, not in a description.

## Current inventory and proposal

| # | Current tool | Overlaps with | Proposal |
|---|---|---|---|
| 1 | `list_vocabularies` | resource `skosmos://vocabularies` | Keep the resource. Drop the tool in v2 (or keep as a compatibility alias, see open questions). |
| 2 | `get_vocabulary` | resource `skosmos://{vocid}` | Keep the resource. Drop the tool in v2 (same question). |
| 3 | `get_concept` | resource `skosmos://{vocid}/{encodedUri}` | Keep both for now. The resource returns fewer fields than the tool (no `hiddenLabel`, and no `vocabulary` or `lang` handling); align them before dropping the tool. |
| 4 | `get_concept_label` | `labels` | Duplicate. Merge into one resource `skosmos://{vocid}/{encodedUri}/labels`. |
| 5 | `labels` | `get_concept_label` | Same as 4. |
| 6 | `concept_path` | none | Keep as tool (computed path from a parameterised start point). |
| 7 | `search_concepts` | none | Keep as tool. |
| 8 | `autocomplete` | none | Keep as tool. |
| 9 | `resolve_label` | `reconcile_concept` | Verify the behaviour overlap, then keep one. `reconcile_concept` already uses lookup and search. |
| 10 | `reconcile_concept` | `resolve_label` | Keep as the single label-to-concept tool, if the overlap check holds. |
| 11 | `vocabulary_schema_overview` | none | Derived, read-only, parameter-light. Move to resource `skosmos://{vocid}/overview`. |
| 12 | `query_guidance` | `suggest_sparql_templates` (partly) | Static curated text. Move to resource `skosmos://guidance/{task}`, or to a prompt. |
| 13 | `suggest_sparql_templates` | `sparql_query_templates` | Duplicate. Keep one resource `skosmos://sparql/templates/{category}`. Drop both tools. |
| 14 | `sparql_query_templates` | `suggest_sparql_templates` | Same as 13. |
| 15 | `broader_concepts` | `traverse_concepts` | Subset of `traverse_concepts`. Keep as aliases in v1, drop in v2. |
| 16 | `narrower_concepts` | `traverse_concepts` | Same as 15. |
| 17 | `related_concepts` | `traverse_concepts` | Same as 15. |
| 18 | `traverse_concepts` | 15–17 | Keep as the single traversal tool. Its `relationships` array already covers all three. |
| 19 | `execute_sparql_query` | none | Keep as tool. Move the long SPARQL cheat sheet out of the description into resource `skosmos://sparql/reference`. |
| 20 | `execute_sparql_update` | none | Keep as tool, mark destructive. Consider off by default behind a config flag (for example `SPARQL_ALLOW_UPDATES`). |
| 21 | `list_sparql_graphs` | none | Keep as tool (it takes an optional endpoint). Optionally add a resource `skosmos://sparql/graphs` for the default endpoint. |

Net effect: 21 tools reduce to about 9 tools (`search_concepts`, `autocomplete`, `reconcile_concept`, `concept_path`, `traverse_concepts`, `execute_sparql_query`, `execute_sparql_update`, `list_sparql_graphs`, and `get_concept` while it stays a tool). The rest become resources, with about 8 resource URIs in total.

## Proposed resource URIs

| URI | Replaces | Notes |
|---|---|---|
| `skosmos://vocabularies` | `list_vocabularies` | Exists today. |
| `skosmos://{vocid}` | `get_vocabulary` | Exists today. |
| `skosmos://{vocid}/{encodedUri}` | `get_concept` | Exists today. Align fields with the tool. |
| `skosmos://{vocid}/{encodedUri}/labels` | `labels`, `get_concept_label` | New. |
| `skosmos://{vocid}/overview` | `vocabulary_schema_overview` | New. |
| `skosmos://guidance/{task}` | `query_guidance` | New. Static text. |
| `skosmos://sparql/templates/{category}` | both template tools | New. |
| `skosmos://sparql/reference` | cheat sheet from `execute_sparql_query` description | New. |
| `skosmos://sparql/graphs` | `list_sparql_graphs` (default endpoint only) | Optional. |

Concept URIs contain `/`, so `{encodedUri}` must stay percent-encoded. That works today, but it is fragile. Check whether the SDK's template matching handles a query-parameter form (`skosmos://concept?vocid=&uri=`) more reliably.

## Plumbing for v2

1. **Use the non-deprecated registration API.** In SDK 1.29.0, `server.tool()` and `server.resource()` are deprecated in favour of `registerTool()` and `registerResource()`.
2. **Add tool annotations.** Mark read-only tools with `readOnlyHint: true`. Mark `execute_sparql_update` with `destructiveHint: true`.
3. **Take the server version from `package.json`.** `src/server/index.ts` hard-codes `'0.1.0'`, while the package is at `0.2.1`.
4. **Give resource templates a `list` callback where it is useful.** Today every template uses `list: undefined`, so clients cannot enumerate concepts or vocabularies.
5. **Cut the cost of the concept resource.** `skosmos://{vocid}/{encodedUri}` makes four upstream calls per read (label, broader, narrower, related). Consider one `getConcept` call, or cache the combined result.
6. **Keep descriptions short.** Move the SPARQL cheat sheets (the two longest descriptions) into resources, as above.
7. **Consider structured output.** Add `outputSchema` for the tools whose results are JSON, so clients can parse them without guessing.

## Decisions

1. **Read tools stay, marked deprecated, removed in 1.0.** Clients that cannot read resources keep working. Each deprecated tool's description starts with `DEPRECATED (use <replacement>; removed in 1.0).`
2. **Aliases stay too.** Merged tools keep their old names as deprecated aliases until 1.0. Their replacements are listed in the table above.
3. **`execute_sparql_update` stays, marked destructive** (`destructiveHint: true`). Its description starts with `DESTRUCTIVE:`. It is not opt-in.
4. **`query_guidance` becomes a prompt.** The tool is deprecated and removed in 1.0.

`resolve_label` and `reconcile_concept` are unchanged. The overlap check is still open.

## Implementation status

Plumbing:

- [x] Non-deprecated registration API: `registerTool`, `registerResource`, `registerPrompt`
- [x] Tool annotations: `readOnlyHint` on read tools, `destructiveHint` on `execute_sparql_update`
- [x] Server version read from `package.json`
- [x] Vocabulary resource template has a `list` callback. The concept template does not, because enumerating every concept is not feasible.
- [x] Concept resource and `get_concept` share one handler, so they return the same fields. Concept results are cached (`cache.concept`), so repeated reads are cheap. The first read still makes four upstream calls.
- [x] SPARQL syntax text moved out of tool descriptions into `skosmos-sparql://reference`. Each tool description is now under 400 characters, enforced by a test.
- [ ] `outputSchema` for tools with JSON results. Deferred. It needs a zod schema per response type, which is a separate piece of work. The handlers already return JSON text, so this can follow without changing the tool names.

Resources and prompts added: `skosmos://{vocid}/{encodedUri}/labels`, `skosmos-overview://{vocid}`, `skosmos-sparql://templates/{category}`, `skosmos-sparql://reference`, and the `query_guidance` prompt. The `skosmos://vocabularies`, `skosmos://{vocid}` and `skosmos://{vocid}/{encodedUri}` resources already existed.

The URIs differ from the proposal table in two places. The overview and SPARQL resources use their own schemes (`skosmos-overview://`, `skosmos-sparql://`), so they cannot collide with the two-segment concept template. The guidance resource became the `query_guidance` prompt, as decided above.

Not done: a resource for `list_sparql_graphs` on the default endpoint. The tool stays as it is.

Tests: `tests/server/mcp-v2.test.ts` connects an MCP client in memory to check the tool annotations, deprecation text, resource and template listings, the reference resource, concept reads, and the prompt.

## Suggested order

1. Agree on the open questions above.
2. Migrate the SDK API and fix the version string (no behaviour change).
3. Add the new resource URIs next to the existing tools, and check that both return the same data.
4. Remove the duplicate tools, keeping aliases if question 2 says so.
5. Trim the SPARQL descriptions and add annotations.
