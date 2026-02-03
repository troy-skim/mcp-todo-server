import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import { validateDueDate, validateCategory, validateStatus } from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError } from '../utils/errors.js';
import { CONSTANTS } from '../config/constants.js';
import type { Todo } from '../types/todo.js';

export function registerFilterByDateRange(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'filter_by_date_range',
    'Filter todos by due date range. All dates in UTC.',
    {
      start_date: z.string().optional().describe('Start date in ISO 8601 format'),
      end_date: z.string().optional().describe('End date in ISO 8601 format'),
      category: z.string().optional().describe('Filter by category'),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Filter by status'),
    },
    async (args) => {
      try {
        const startDate = args.start_date ? validateDueDate(args.start_date) : undefined;
        const endDate = args.end_date ? validateDueDate(args.end_date) : undefined;
        const category = args.category ? validateCategory(args.category) : undefined;
        const status = args.status ? validateStatus(args.status) : undefined;

        let query = supabase
          .from('todos')
          .select('*')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .is('deleted_at', null)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true });

        if (startDate) {
          query = query.gte('due_date', startDate);
        }

        if (endDate) {
          query = query.lte('due_date', endDate);
        }

        if (category) {
          query = query.eq('category', category);
        }

        if (status) {
          query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
          throw createDatabaseError(error.message);
        }

        const todos = data as Todo[];

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: todos.length,
                filters: {
                  start_date: startDate || null,
                  end_date: endDate || null,
                  category: category || null,
                  status: status || null,
                },
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
