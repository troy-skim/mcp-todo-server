import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { validateId } from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError, createNotFoundError, createValidationError } from '../utils/errors.js';
import type { Todo } from '../types/todo.js';

export function registerRestoreTodo(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'restore_todo',
    'Restore a soft-deleted todo',
    {
      id: z.string().uuid().describe('The UUID of the soft-deleted todo to restore'),
    },
    async (args) => {
      try {
        const id = validateId(args.id);

        // First check if the todo exists and is deleted
        const { data: existingTodo, error: checkError } = await supabase
          .from('todos')
          .select('*')
          .eq('id', id)
          .single();

        if (checkError) {
          if (checkError.code === 'PGRST116') {
            throw createNotFoundError('Todo', id);
          }
          throw createDatabaseError(checkError.message);
        }

        if (!existingTodo.deleted_at) {
          throw createValidationError(`Todo '${id}' is not deleted`);
        }

        // Restore the todo
        const { data, error } = await supabase
          .from('todos')
          .update({ deleted_at: null })
          .eq('id', id)
          .select()
          .single();

        if (error) {
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
