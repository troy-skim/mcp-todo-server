import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { validateUpdateTodoInput } from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError, createNotFoundError } from '../utils/errors.js';
import type { Todo } from '../types/todo.js';

export function registerUpdateTodo(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'update_todo',
    'Update an existing todo. Only updates fields that are provided (partial update).',
    {
      id: z.string().uuid().describe('The UUID of the todo to update (required)'),
      title: z.string().min(1).max(500).optional().describe('New title'),
      description: z.string().max(5000).optional().describe('New description'),
      category: z.string().min(1).max(50).optional().describe('New category'),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('New status'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
      tags: z.array(z.string().max(30)).max(20).optional().describe('New tags array'),
      due_date: z.string().optional().describe('New due date in ISO 8601 format'),
    },
    async (args) => {
      try {
        const input = validateUpdateTodoInput(args);

        // Build update object with only provided fields
        const updateData: Record<string, unknown> = {};

        if (input.title !== undefined) updateData.title = input.title;
        if (input.description !== undefined) updateData.description = input.description || null;
        if (input.category !== undefined) updateData.category = input.category;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.priority !== undefined) updateData.priority = input.priority || null;
        if (input.tags !== undefined) updateData.tags = input.tags || null;
        if (input.due_date !== undefined) updateData.due_date = input.due_date || null;

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
          // Just fetch and return the current todo
          const { data, error } = await supabase
            .from('todos')
            .select('*')
            .eq('id', input.id)
            .is('deleted_at', null)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              throw createNotFoundError('Todo', input.id);
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
        }

        const { data, error } = await supabase
          .from('todos')
          .update(updateData)
          .eq('id', input.id)
          .is('deleted_at', null)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            throw createNotFoundError('Todo', input.id);
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
