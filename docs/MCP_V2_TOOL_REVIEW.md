# MCP v2: tool and resource review

Status: proposal, for discussion. No behaviour changes in this document.

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

## Open questions

1. **Which clients must work?** If the target clients do not surface resources to the model (some MCP clients expose only tools), moving reads to resources hides them. In that case keep `get_concept`, `list_vocabularies` and `get_vocabulary` as tools as well. This is the main trade-off in this proposal.
2. **Compatibility aliases for v1 tools?** Keep the old tool names as thin aliases for one release, then remove them in v2? Or break cleanly?
3. **Should `execute_sparql_update` stay in the default tool set?** Against Finto, which is read-only in practice, the tool only adds risk. Should it be opt-in?
4. **Should `query_guidance` become a prompt rather than a resource?** Prompts suit a user choosing a task. Resources suit a client reading reference text.

## Suggested order

1. Agree on the open questions above.
2. Migrate the SDK API and fix the version string (no behaviour change).
3. Add the new resource URIs next to the existing tools, and check that both return the same data.
4. Remove the duplicate tools, keeping aliases if question 2 says so.
5. Trim the SPARQL descriptions and add annotations.
