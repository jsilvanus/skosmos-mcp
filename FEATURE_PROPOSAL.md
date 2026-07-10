# Feature Proposal: Schema-Guided Query Assistance for skosmos-mcp

## Source

This proposal is inspired by the Sparna Semantics 2026 work on MCP-over-SPARQL, especially the idea of using MCP tools to help an AI client move from a natural-language question to a correct SPARQL query through schema discovery, entity reconciliation, and example-based guidance.

Source reference:
- Sparna Semantics 2026 / MCP-over-SPARQL concept
- Public repository: https://github.com/sparna-git/sparna-semantics-2026

## Goal

Extend skosmos-mcp so that AI clients can answer vocabulary-related questions more reliably by combining the existing Skosmos REST API with a small set of schema-aware assistance tools.

The aim is not to replace the current Skosmos integration, but to make it easier for an MCP client to discover the structure of a vocabulary, resolve names to concepts, and build correct follow-up queries with less guesswork.

## Proposed Features

### 1. Vocabulary schema overview tool
Add a tool that returns a compact overview of a vocabulary's structure, for example:
- available concept classes or top-level groups
- common relationship patterns
- typical query entry points for exploration

This would help an AI client understand how to start querying a vocabulary before it tries to compose a SPARQL or traversal request.

### 2. SKOS-specific query guidance tool
Add a tool that returns curated, validated examples for common tasks such as:
- finding broader/narrower concepts
- tracing a concept path to the root
- resolving a label to a concept URI
- exploring related concepts

These examples should be lightweight and tailored to SKOS vocabularies rather than generic RDF graphs.

### 3. Concept reconciliation helper
Add a structured helper that makes it easier to resolve a user-facing label to a concept URI in a vocabulary. This would complement the existing search and label tools by providing a more explicit “entity resolution” step for agents.

### 4. Schema-aware SPARQL template suggestions
Add a tool or response helper that suggests relevant SPARQL query templates based on the current vocabulary and task type. Examples include:
- hierarchy traversal
- label resolution
- concept neighborhood exploration
- vocabulary statistics

This would reduce schema guessing while still keeping the user in full control of the final query.

### 5. Optional explanation layer for traversal and query results
Add an optional explanation mode for the existing traversal tools, where the response includes a short summary such as:
- what relation was traversed
- what the starting concept was
- how many nodes/edges were discovered

This would make the server more useful for agents that need to explain their reasoning.

## Why This Fits skosmos-mcp

skosmos-mcp already exposes strong primitives for:
- listing vocabularies
- retrieving concept details
- performing searches
- resolving labels
- traversing broader/narrower/related concepts
- executing SPARQL

What is missing is a higher-level guidance layer that helps an MCP client understand which tool to use and how to combine them effectively for common vocabulary tasks.

## Distilled Proposal vs. the Source

The source work is SHACL-driven and focuses on a generic MCP server that sits between an AI client and a SPARQL endpoint, using SHACL descriptions and entity reconciliation to guide query generation over a knowledge graph.

This proposal is a distilled adaptation for skosmos-mcp:

- Source: generic knowledge-graph querying with SHACL as the main schema source.
- Proposed skosmos-mcp version: SKOS vocabulary exploration and traversal, built on top of the existing Skosmos API and SPARQL support.
- Source: emphasizes detailed graph schema introspection and schema-grounded SPARQL generation.
- Proposed version: emphasizes vocabulary discovery, concept resolution, hierarchy traversal, and example-based guidance.
- Source: assumes a separate schema layer and a more explicit graph-query workflow.
- Proposed version: fits into the current tool set and keeps the integration lightweight rather than introducing a new architectural dependency.

## Suggested Implementation Order

1. Add a vocabulary overview tool.
2. Add SKOS-specific query guidance examples.
3. Add a structured concept reconciliation helper.
4. Add optional SPARQL template suggestions.
5. Add explanation-friendly output for traversal results.

## Expected Outcome

With these additions, skosmos-mcp would become more agent-friendly for natural-language vocabulary exploration, especially in scenarios where the client needs to bridge user intent with the correct Skosmos concepts and relationships.
