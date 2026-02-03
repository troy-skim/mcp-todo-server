import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { validateId, validateBoolean } from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError, createNotFoundError } from '../utils/errors.js';

export function registerDeleteTodo(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'delete_todo',
    'Soft-delete a todo by ID. Use permanent=true for hard delete.',
    {
      id: z.string().uuid().describe('The UUID of the todo to delete'),
      permanent: z.boolean().optional().describe('If true, permanently deletes the todo (default: false)'),
    },
    async (args) => {
      try {
        const id = validateId(args.id);
        const permanent = validateBoolean(args.permanent, 'permanent');

        if (permanent) {
          // Hard delete
          const { error } = await supabase
            .from('todos')
            .delete()
            .eq('id', id);

          if (error) {
            throw createDatabaseError(error.message);
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: true,
                  message: `Todo '${id}' has been permanently deleted`,
                }, null, 2),
              },
            ],
          };
        } else {
          // Soft delete
          const { data, error } = await supabase
            .from('todos')
            .update({ deleted_at: new Date().toISOString() })
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
                text: JSON.stringify({
                  success: true,
                  message: `Todo '${id}' has been soft-deleted and can be restored`,
                }, null, 2),
              },
            ],
          };
        }
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
