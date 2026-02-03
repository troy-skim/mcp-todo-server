import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { validateCreateTodoInput } from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError } from '../utils/errors.js';
import { CONSTANTS } from '../config/constants.js';
import type { Todo } from '../types/todo.js';

export function registerAddTodo(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'add_todo',
    'Create a new todo item',
    {
      title: z.string().min(1).max(500).describe('The title of the todo (required)'),
      description: z.string().max(5000).optional().describe('Optional description'),
      category: z.string().min(1).max(50).optional().describe('Category (defaults to "personal")'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority level'),
      tags: z.array(z.string().max(30)).max(20).optional().describe('Array of tags'),
      due_date: z.string().optional().describe('Due date in ISO 8601 format'),
    },
    async (args) => {
      try {
        const input = validateCreateTodoInput(args);

        const todoData = {
          user_id: CONSTANTS.DEFAULT_USER_ID,
          title: input.title,
          description: input.description || null,
          category: input.category || CONSTANTS.DEFAULT_CATEGORY,
          status: CONSTANTS.DEFAULT_STATUS,
          priority: input.priority || null,
          tags: input.tags || null,
          due_date: input.due_date || null,
        };

        const { data, error } = await supabase
          .from('todos')
          .insert(todoData)
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
