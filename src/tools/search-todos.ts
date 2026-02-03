import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { validateLimit } from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError, createValidationError } from '../utils/errors.js';
import { CONSTANTS } from '../config/constants.js';
import type { Todo } from '../types/todo.js';

export function registerSearchTodos(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'search_todos',
    'Full-text search on title and description',
    {
      query: z.string().min(1).describe('Search query'),
      limit: z.number().min(1).max(100).optional().describe('Number of results (default: 20)'),
    },
    async (args) => {
      try {
        if (!args.query || typeof args.query !== 'string') {
          throw createValidationError('Search query is required');
        }

        const searchQuery = args.query.trim();
        if (searchQuery.length === 0) {
          throw createValidationError('Search query cannot be empty');
        }

        const limit = validateLimit(args.limit ?? 20);

        // Use ilike for case-insensitive search on title and description
        // Search in both title and description
        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .is('deleted_at', null)
          .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          throw createDatabaseError(error.message);
        }

        const todos = data as Todo[];

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                query: searchQuery,
                count: todos.length,
                todos,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: formatErrorResponse(error),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
