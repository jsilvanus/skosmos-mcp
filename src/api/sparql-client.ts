/**
 * SPARQL client for executing queries and updates against SPARQL endpoints.
 * Contains code derived from ramuzes/mcp-jena (https://github.com/ramuzes/mcp-jena)
 * Used under MIT License.
 */
import axios from 'axios';
import { SparqlHelper } from '../util/sparql-helper.js';

/**
 * Represents the result of a SPARQL query
 */
export interface SparqlResult {
  head: {
    vars: string[];
  };
  results: {
    bindings: Array<{
      [key: string]: {
        type: string;
        value: string;
        datatype?: string;
        'xml:lang'?: string;
      };
    }>;
  };
}

/**
 * Client for interacting with SPARQL endpoints
 */
export class SparqlClient {
  private baseUrl: string;
  private username: string;
  private password: string;

  /**
   * Creates a new SPARQL client
   * @param baseUrl - SPARQL endpoint URL
   * @param username - Username for HTTP Basic authentication
   * @param password - Password for HTTP Basic authentication
   */
  constructor(baseUrl: string, username = '', password = '') {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  /**
   * Determines the appropriate update endpoint URL based on the base URL
   * @param baseUrl - The base SPARQL endpoint URL
   * @returns The update endpoint URL
   */
  private getUpdateEndpoint(baseUrl: string): string {
    try {
      const url = new URL(baseUrl);
      const pathname = url.pathname;

      // If path ends with /query, replace with /update
      if (pathname.endsWith('/query')) {
        url.pathname = pathname.replace(/\/query$/, '/update');
        return url.toString();
      } else if (pathname.endsWith('/sparql')) {
        // For /sparql endpoints, replace with /update
        url.pathname = pathname.replace(/\/sparql\/?$/, '/update');
        return url.toString();
      } else {
        // Assume the endpoint already handles updates
        return baseUrl;
      }
    } catch {
      // Fallback if URL parsing fails - use simple string replacement on path segment
      const match = baseUrl.match(/^(.*?)(\/(query|sparql))(\?|\/|$)(.*?)$/);
      if (match) {
        // Reconstruct URL with /update instead of /query or /sparql
        return match[1] + '/update' + match[4] + match[5];
      }
      return baseUrl;
    }
  }

  /**
   * Executes a SPARQL query against the endpoint
   * @param sparqlQuery - The SPARQL query to execute
   * @returns Query results
   */
  async executeQuery(sparqlQuery: string): Promise<SparqlResult> {
    try {
      // Validate query before execution
      const validation = SparqlHelper.validateQuery(sparqlQuery);
      if (!validation.valid) {
        const errorMsg = `Invalid SPARQL query:\n${validation.errors.join('\n')}`;
        const suggestions = validation.suggestions.length > 0 ? `\n\nSuggestions:\n${validation.suggestions.join('\n')}` : '';
        throw new Error(errorMsg + suggestions);
      }

      // Add performance suggestions as warnings (but don't block execution)
      const improvements = SparqlHelper.suggestImprovements(sparqlQuery);
      if (improvements.length > 0) {
        console.warn('💡 Query suggestions:', improvements.join(', '));
      }

      const config: Record<string, unknown> = {
        params: {
          query: sparqlQuery,
        },
        headers: {
          Accept: 'application/sparql-results+json',
        },
      };

      // Add authentication if credentials are provided
      if (this.username && this.password) {
        config.auth = {
          username: this.username,
          password: this.password,
        };
      }

      const response = await axios.get<SparqlResult>(`${this.baseUrl}`, config);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const enhancedError = SparqlHelper.enhanceErrorMessage(
          `SPARQL query failed: ${error.message}. ${error.response?.data?.message || ''}`,
          sparqlQuery
        );
        throw new Error(enhancedError);
      }
      throw error;
    }
  }

  /**
   * Executes a SPARQL update query against the endpoint
   * @param sparqlUpdate - The SPARQL update query to execute
   * @returns Success message
   */
  async executeUpdate(sparqlUpdate: string): Promise<string> {
    try {
      // Basic validation for update queries
      const validation = SparqlHelper.validateQuery(sparqlUpdate);
      if (!validation.valid) {
        const errorMsg = `Invalid SPARQL update:\n${validation.errors.join('\n')}`;
        const suggestions = validation.suggestions.length > 0 ? `\n\nSuggestions:\n${validation.suggestions.join('\n')}` : '';
        throw new Error(errorMsg + suggestions);
      }

      const config: Record<string, unknown> = {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      };

      // Add authentication if credentials are provided
      if (this.username && this.password) {
        config.auth = {
          username: this.username,
          password: this.password,
        };
      }

      const updateUrl = this.getUpdateEndpoint(this.baseUrl);

      await axios.post(updateUrl, new URLSearchParams({ update: sparqlUpdate }), config);

      return 'Update successful';
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const enhancedError = SparqlHelper.enhanceErrorMessage(
          `SPARQL update failed: ${error.message}. ${error.response?.data?.message || ''}`,
          sparqlUpdate
        );
        throw new Error(enhancedError);
      }
      throw error;
    }
  }

  /**
   * Lists all available graphs in the endpoint
   * @returns Array of graph URIs
   */
  async listGraphs(): Promise<string[]> {
    const query = `
      SELECT DISTINCT ?g
      WHERE {
        GRAPH ?g { ?s ?p ?o }
      }
    `;

    const result = await this.executeQuery(query);
    return result.results.bindings
      .map((binding) => binding['g']?.value)
      .filter((value): value is string => value !== undefined);
  }
}
