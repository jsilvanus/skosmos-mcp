/**
 * SPARQL syntax and graph reference, served as the skosmos-sparql://reference resource.
 * Kept out of the tool descriptions so that tools/list stays short.
 */
export const SPARQL_REFERENCE = [
  `Execute a SPARQL query against a SPARQL endpoint (SELECT, CONSTRUCT, ASK, or DESCRIBE).

SPARQL (SPARQL Protocol and RDF Query Language) is a query language for RDF data.

Key SPARQL Query Forms:
- SELECT: Returns variable bindings as a table
- CONSTRUCT: Returns RDF triples
- ASK: Returns true/false
- DESCRIBE: Returns RDF description of resources

Basic SPARQL Syntax:
- PREFIX declarations: PREFIX ex: <http://example.org/>
- WHERE clause with triple patterns: ?subject ?predicate ?object
- Optional patterns: OPTIONAL { ?s ?p ?o }
- Filters: FILTER(?var > 10)
- Graph patterns: GRAPH <uri> { ?s ?p ?o }
- Property paths: ?s ex:knows/ex:friend ?o (sequence), ?s ex:knows* ?o (zero or more)

Common Query Templates:
1. Basic exploration: SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10
2. Count triples: SELECT (COUNT(*) as ?count) WHERE { ?s ?p ?o }
3. List types: SELECT DISTINCT ?type WHERE { ?s a ?type }
4. Property path: SELECT ?person ?friend WHERE { ?person foaf:knows/foaf:knows ?friend }
5. Optional properties: SELECT ?s ?name WHERE { ?s a ex:Person . OPTIONAL { ?s foaf:name ?name } }
6. Named graph query: SELECT ?s ?p ?o FROM NAMED <graph> WHERE { GRAPH <graph> { ?s ?p ?o } }
7. Filter by value: SELECT ?s WHERE { ?s ex:age ?age . FILTER(?age > 18) }

Property Path Operators:
- / (sequence): ?s foaf:knows/foaf:name ?name
- | (alternative): ?s (foaf:name|rdfs:label) ?name
- * (zero or more): ?s foaf:knows* ?connected
- + (one or more): ?s ex:partOf+ ?container
- ? (zero or one): ?s foaf:knows? ?maybeKnown
- ^ (inverse): ?s ^ex:hasChild ?parent
- ! (negation): ?s !(rdf:type) ?notType`,
  `Execute a SPARQL update query against a SPARQL endpoint.

SPARQL Update Operations:
- INSERT DATA: Add triples to the dataset
- DELETE DATA: Remove specific triples
- INSERT/DELETE WHERE: Conditional insert/delete based on patterns
- LOAD/CLEAR: Load/clear entire graphs
- CREATE/DROP: Manage graph lifecycle

Basic Update Syntax:
- INSERT DATA { <subject> <predicate> <object> }
- DELETE DATA { <subject> <predicate> <object> }
- INSERT { ?s <new:prop> "value" } WHERE { ?s <old:prop> ?o }
- DELETE { ?s <old:prop> ?o } WHERE { ?s <old:prop> ?o }
- CLEAR GRAPH <graph-uri>

Example Updates:
1. Insert data: INSERT DATA { <ex:person1> foaf:name "John" ; ex:age 25 }
2. Delete data: DELETE DATA { <ex:person1> ex:age 25 }
3. Conditional update: DELETE { ?p ex:status "pending" } INSERT { ?p ex:status "active" } WHERE { ?p ex:status "pending" }
4. Insert with graph: INSERT DATA { GRAPH <ex:metadata> { <ex:dataset1> dcterms:created "2024-01-01"^^xsd:date } }
5. Clear graph: CLEAR GRAPH <ex:temporary>`,
  `List all available named graphs in a SPARQL endpoint.

Named graphs in RDF provide context and provenance for triples. Each graph is identified by a URI.

Common Graph Patterns:
- Default graph (unnamed): Contains triples not in any specific graph
- Named graphs: <http://example.org/graph1>, <http://data.gov/dataset1>
- Metadata graphs: Often contain information about other graphs
- Versioned graphs: <http://data.org/v1>, <http://data.org/v2>

Use Cases:
- Data provenance: Track where data came from
- Temporal data: Different time periods in separate graphs
- Access control: Different permissions per graph
- Data quality: Separate validated vs raw data`,
].join("\n\n---\n\n");
