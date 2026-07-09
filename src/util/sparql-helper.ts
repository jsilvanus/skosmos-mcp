export interface ValidationResult {
  valid: boolean;
  errors: string[];
  suggestions: string[];
  queryType?: 'SELECT' | 'CONSTRUCT' | 'ASK' | 'DESCRIBE' | 'INSERT' | 'DELETE' | 'UNKNOWN';
}

export class SparqlHelper {
  /**
   * Validates a SPARQL query and provides suggestions
   */
  static validateQuery(query: string): ValidationResult {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (!query.trim()) {
      errors.push('Query cannot be empty');
      return { valid: false, errors, suggestions };
    }

    const upperQuery = query.toUpperCase();

    // Detect query type
    let queryType: ValidationResult['queryType'] = 'UNKNOWN';
    if (upperQuery.includes('SELECT')) queryType = 'SELECT';
    else if (upperQuery.includes('CONSTRUCT')) queryType = 'CONSTRUCT';
    else if (upperQuery.includes('ASK')) queryType = 'ASK';
    else if (upperQuery.includes('DESCRIBE')) queryType = 'DESCRIBE';
    else if (upperQuery.includes('INSERT')) queryType = 'INSERT';
    else if (upperQuery.includes('DELETE')) queryType = 'DELETE';

    // Check for query form
    const hasQueryForm = ['SELECT', 'CONSTRUCT', 'ASK', 'DESCRIBE', 'INSERT', 'DELETE'].some((form) =>
      upperQuery.includes(form)
    );

    if (!hasQueryForm) {
      errors.push('Query must include a query form: SELECT, CONSTRUCT, ASK, DESCRIBE, INSERT, or DELETE');
      suggestions.push('Example: SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10');
      return { valid: false, errors, suggestions, queryType };
    }

    // Check for WHERE clause in queries that typically need it
    if (
      (queryType === 'SELECT' || queryType === 'CONSTRUCT') &&
      !upperQuery.includes('WHERE') &&
      !upperQuery.includes('INSERT DATA') &&
      !upperQuery.includes('DELETE DATA')
    ) {
      errors.push('SELECT and CONSTRUCT queries typically require a WHERE clause');
      suggestions.push('Add: WHERE { ?subject ?predicate ?object }');
    }

    // Check for balanced braces
    const openBraces = (query.match(/{/g) || []).length;
    const closeBraces = (query.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push(`Unbalanced braces: ${openBraces} opening braces, ${closeBraces} closing braces`);
      suggestions.push('Check that every { has a matching }');
    }

    // Check for balanced parentheses
    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push(`Unbalanced parentheses: ${openParens} opening, ${closeParens} closing`);
      suggestions.push('Check that every ( has a matching )');
    }

    // Check for potentially malformed PREFIX declarations
    const prefixLines = query.split('\n').filter((line) => {
      const trimmed = line.trim().toUpperCase();
      // Valid PREFIX line should have both ':' and '<' (e.g., PREFIX ex: <uri>)
      // So flag lines missing either character
      return trimmed.startsWith('PREFIX') && (!trimmed.includes(':') || !trimmed.includes('<'));
    });
    if (prefixLines.length > 0) {
      suggestions.push('PREFIX declarations should have format: PREFIX prefix: <uri>');
    }

    // Suggest LIMIT for potentially large result sets
    if (queryType === 'SELECT' && !upperQuery.includes('LIMIT') && !upperQuery.includes('COUNT')) {
      suggestions.push('Consider adding LIMIT clause to prevent large result sets');
    }

    // Check for common syntax issues
    if (query.includes('?') && !query.includes('WHERE')) {
      suggestions.push('Variables (starting with ?) typically appear in WHERE clauses');
    }

    // Check for property path syntax issues
    if (query.includes('/') || query.includes('*') || query.includes('+')) {
      if (!upperQuery.includes('WHERE')) {
        suggestions.push('Property paths (/, *, +) should be used within WHERE clauses');
      }
    }

    // Check for FILTER placement
    if (upperQuery.includes('FILTER') && !upperQuery.includes('WHERE')) {
      errors.push('FILTER clauses must be inside WHERE blocks');
    }

    return {
      valid: errors.length === 0,
      errors,
      suggestions,
      queryType,
    };
  }

  /**
   * Provides enhanced error messages with SPARQL-specific guidance
   */
  static enhanceErrorMessage(originalError: string, query: string): string {
    let enhancedMessage = originalError;

    const upperQuery = query.toUpperCase();

    // Common error patterns and their solutions
    if (originalError.includes('400') || originalError.includes('Bad Request')) {
      enhancedMessage += '\n\n🔧 Common SPARQL syntax issues:';
      enhancedMessage += '\n• Check PREFIX declarations: PREFIX prefix: <uri>';
      enhancedMessage += '\n• Ensure proper triple pattern syntax: ?subject ?predicate ?object';
      enhancedMessage += '\n• Verify WHERE clause is properly formed with { }';
      enhancedMessage += '\n• Check for missing closing braces }';
      enhancedMessage += '\n• Validate property path syntax (/, *, +, ?, ^)';

      if (upperQuery.includes('FILTER')) {
        enhancedMessage += '\n• FILTER clauses must be inside WHERE blocks';
      }
    }

    if (originalError.includes('401') || originalError.includes('Unauthorized')) {
      enhancedMessage += '\n\n🔐 Authentication issue: Check your username and password';
    }

    if (originalError.includes('404') || originalError.includes('Not Found')) {
      enhancedMessage += '\n\n🎯 Endpoint issue: Verify the endpoint URL';
    }

    if (originalError.includes('timeout')) {
      enhancedMessage += '\n\n⏱️ Query timeout: Try adding LIMIT clause or simplifying the query';
    }

    return enhancedMessage;
  }

  /**
   * Suggests query improvements based on content analysis
   */
  static suggestImprovements(query: string): string[] {
    const suggestions: string[] = [];
    const upperQuery = query.toUpperCase();

    // Performance suggestions
    if (upperQuery.includes('SELECT') && !upperQuery.includes('LIMIT') && !upperQuery.includes('COUNT')) {
      suggestions.push('Add LIMIT clause for better performance and testing');
    }

    if (upperQuery.includes('?S ?P ?O') && !upperQuery.includes('LIMIT')) {
      suggestions.push('Querying all triples (?s ?p ?o) without LIMIT can be very slow');
    }

    // Readability suggestions
    if (!query.includes('\n') && query.length > 100) {
      suggestions.push('Consider formatting the query with line breaks for better readability');
    }

    if (upperQuery.includes('FILTER') && upperQuery.includes('REGEX')) {
      suggestions.push('REGEX filters can be slow; consider using more specific triple patterns when possible');
    }

    // Best practices
    if (upperQuery.includes('OPTIONAL') && !upperQuery.includes('BOUND')) {
      suggestions.push('Consider using BOUND() function to check if OPTIONAL variables are bound');
    }

    return suggestions;
  }

  /**
   * Common vocabulary prefixes for convenience
   */
  static getCommonPrefixes(): Record<string, string> {
    return {
      rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      owl: 'http://www.w3.org/2002/07/owl#',
      foaf: 'http://xmlns.com/foaf/0.1/',
      dcterms: 'http://purl.org/dc/terms/',
      skos: 'http://www.w3.org/2004/02/skos/core#',
      schema: 'http://schema.org/',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      geo: 'http://www.w3.org/2003/01/geo/wgs84_pos#',
      time: 'http://www.w3.org/2006/time#',
    };
  }
}
