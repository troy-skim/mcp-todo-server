import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { validateId } from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError, createNotFoundError } from '../utils/errors.js';
import type { Todo } from '../types/todo.js';

export function registerMarkInProgress(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'mark_in_progress',
    'Mark a todo as in progress',
    {
      id: z.string().uuid().describe('The UUID of the todo to mark as in progress'),
    },
    async (args) => {
      try {
        const id = validateId(args.id);

        const { data, error } = await supabase
          .from('todos')
          .update({ status: 'in_progress' })
          .eq('id', id)
          .is('deleted_at', null)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw createNotFoundError('Todo', id);
          }
          throw createDatabaseError(error.message);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(data as Todo, null, 2),
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
