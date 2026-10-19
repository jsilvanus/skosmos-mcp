import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { ZodRawShape } from 'zod';

/** Read-only tools: query the Skosmos or SPARQL endpoint and change nothing. */
const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };

/** Tools that change data on a SPARQL endpoint. */
const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

export function registerReadTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  handler: ToolCallback<Shape>,
): void {
  server.registerTool(name, { description, inputSchema, annotations: READ_ONLY }, handler);
}

export function registerWriteTool<Shape extends ZodRawShape>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Shape,
  handler: ToolCallback<Shape>,
): void {
  server.registerTool(name, { description, inputSchema, annotations: DESTRUCTIVE }, handler);
}
