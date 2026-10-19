import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildTaskGuidance } from '../tools/assist.js';

/**
 * User-invoked prompts. Replaces the query_guidance tool, which is deprecated.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'query_guidance',
    {
      title: 'SKOS query guidance',
      description:
        'Curated guidance for common SKOS vocabulary tasks: exploration, label resolution, hierarchy traversal, related concepts and search',
      argsSchema: {
        vocabulary: z.string().min(1).describe('Vocabulary identifier'),
        task: z
          .enum(['explore', 'resolve', 'hierarchy', 'related', 'search', 'all'])
          .optional()
          .describe('Task to tailor the guidance to'),
      },
    },
    ({ vocabulary, task }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: JSON.stringify(
              { vocabulary, task: task ?? 'all', guidance: buildTaskGuidance(vocabulary, task) },
              null,
              2,
            ),
          },
        },
      ],
    }),
  );
}
