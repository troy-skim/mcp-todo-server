import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  validateCategory,
  validateStatus,
  validatePriority,
  validateLimit,
  validateOffset,
  validateBoolean,
} from '../utils/validation.js';
import { formatErrorResponse, createDatabaseError } from '../utils/errors.js';
import { CONSTANTS } from '../config/constants.js';
import type { Todo } from '../types/todo.js';

export function registerListTodos(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'list_todos',
    'List todos with optional filtering. Returns active todos by default.',
    {
      category: z.string().optional().describe('Filter by category'),
      status: z.enum(['pending', 'in_progress', 'completed']).optional().describe('Filter by status'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority'),
      tag: z.string().optional().describe('Filter by tag'),
      include_deleted: z.boolean().optional().describe('Include soft-deleted todos (default: false)'),
      limit: z.number().min(1).max(100).optional().describe('Number of results (default: 50, max: 100)'),
      offset: z.number().min(0).optional().describe('Offset for pagination (default: 0)'),
    },
    async (args) => {
      try {
        const category = args.category ? validateCategory(args.category) : undefined;
        const status = args.status ? validateStatus(args.status) : undefined;
        const priority = args.priority ? validatePriority(args.priority) : undefined;
        const includeDeleted = validateBoolean(args.include_deleted, 'include_deleted');
        const limit = validateLimit(args.limit);
        const offset = validateOffset(args.offset);

        let query = supabase
          .from('todos')
          .select('*')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        // Filter by deleted_at unless include_deleted is true
        if (!includeDeleted) {
          query = query.is('deleted_at', null);
        }

        if (category) {
          query = query.eq('category', category);
        }

        if (status) {
          query = query.eq('status', status);
        }

        if (priority) {
          query = query.eq('priority', priority);
        }

        if (args.tag) {
          query = query.contains('tags', [args.tag.toLowerCase()]);
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
