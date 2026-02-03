import { SupabaseClient } from '@supabase/supabase-js';
import { CONSTANTS } from '../config/constants.js';
import {
  validateCreateTodoInput,
  validateUpdateTodoInput,
  validateId,
  validateCategory,
  validateStatus,
  validatePriority,
  validateLimit,
  validateOffset,
  validateBoolean,
  validateDueDate,
} from '../utils/validation.js';
import {
  formatErrorResponse,
  createDatabaseError,
  createNotFoundError,
  createValidationError,
} from '../utils/errors.js';
import type { Todo } from '../types/todo.js';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

type ToolsMap = Map<string, { description: string; inputSchema: unknown; handler: (args: unknown) => Promise<ToolResult> }>;

export function createTools(supabase: SupabaseClient): ToolsMap {
  const tools: ToolsMap = new Map();

  // add_todo
  tools.set('add_todo', {
    description: 'Create a new todo item',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 500, description: 'The title of the todo (required)' },
        description: { type: 'string', maxLength: 5000, description: 'Optional description' },
        category: { type: 'string', minLength: 1, maxLength: 50, description: 'Category (defaults to "personal")' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Priority level' },
        tags: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 20, description: 'Array of tags' },
        due_date: { type: 'string', description: 'Due date in ISO 8601 format' },
      },
      required: ['title'],
    },
    handler: async (args) => {
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

        const { data, error } = await supabase.from('todos').insert(todoData).select().single();
        if (error) throw createDatabaseError(error.message);

        return { content: [{ type: 'text', text: JSON.stringify(data as Todo, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // list_todos
  tools.set('list_todos', {
    description: 'List todos with optional filtering. Returns active todos by default.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Filter by category' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Filter by status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Filter by priority' },
        tag: { type: 'string', description: 'Filter by tag' },
        include_deleted: { type: 'boolean', description: 'Include soft-deleted todos (default: false)' },
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Number of results (default: 50)' },
        offset: { type: 'number', minimum: 0, description: 'Offset for pagination (default: 0)' },
      },
    },
    handler: async (args) => {
      try {
        const params = args as Record<string, unknown>;
        const category = params.category ? validateCategory(params.category) : undefined;
        const status = params.status ? validateStatus(params.status) : undefined;
        const priority = params.priority ? validatePriority(params.priority) : undefined;
        const includeDeleted = validateBoolean(params.include_deleted, 'include_deleted');
        const limit = validateLimit(params.limit);
        const offset = validateOffset(params.offset);

        let query = supabase
          .from('todos')
          .select('*')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (!includeDeleted) query = query.is('deleted_at', null);
        if (category) query = query.eq('category', category);
        if (status) query = query.eq('status', status);
        if (priority) query = query.eq('priority', priority);
        if (params.tag) query = query.contains('tags', [String(params.tag).toLowerCase()]);

        const { data, error } = await query;
        if (error) throw createDatabaseError(error.message);

        return { content: [{ type: 'text', text: JSON.stringify({ count: (data as Todo[]).length, todos: data }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // get_todo
  tools.set('get_todo', {
    description: 'Get a single todo by its ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid', description: 'The UUID of the todo' } },
      required: ['id'],
    },
    handler: async (args) => {
      try {
        const { id } = args as { id: string };
        validateId(id);

        const { data, error } = await supabase.from('todos').select('*').eq('id', id).is('deleted_at', null).single();
        if (error) {
          if (error.code === 'PGRST116') throw createNotFoundError('Todo', id);
          throw createDatabaseError(error.message);
        }

        return { content: [{ type: 'text', text: JSON.stringify(data as Todo, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // update_todo
  tools.set('update_todo', {
    description: 'Update an existing todo. Only updates fields that are provided (partial update).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'The UUID of the todo to update (required)' },
        title: { type: 'string', minLength: 1, maxLength: 500, description: 'New title' },
        description: { type: 'string', maxLength: 5000, description: 'New description' },
        category: { type: 'string', minLength: 1, maxLength: 50, description: 'New category' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'New status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'New priority' },
        tags: { type: 'array', items: { type: 'string', maxLength: 30 }, maxItems: 20, description: 'New tags' },
        due_date: { type: 'string', description: 'New due date in ISO 8601 format' },
      },
      required: ['id'],
    },
    handler: async (args) => {
      try {
        const input = validateUpdateTodoInput(args);
        const updateData: Record<string, unknown> = {};

        if (input.title !== undefined) updateData.title = input.title;
        if (input.description !== undefined) updateData.description = input.description || null;
        if (input.category !== undefined) updateData.category = input.category;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.priority !== undefined) updateData.priority = input.priority || null;
        if (input.tags !== undefined) updateData.tags = input.tags || null;
        if (input.due_date !== undefined) updateData.due_date = input.due_date || null;

        if (Object.keys(updateData).length === 0) {
          const { data, error } = await supabase.from('todos').select('*').eq('id', input.id).is('deleted_at', null).single();
          if (error) {
            if (error.code === 'PGRST116') throw createNotFoundError('Todo', input.id);
            throw createDatabaseError(error.message);
          }
          return { content: [{ type: 'text', text: JSON.stringify(data as Todo, null, 2) }] };
        }

        const { data, error } = await supabase.from('todos').update(updateData).eq('id', input.id).is('deleted_at', null).select().single();
        if (error) {
          if (error.code === 'PGRST116') throw createNotFoundError('Todo', input.id);
          throw createDatabaseError(error.message);
        }

        return { content: [{ type: 'text', text: JSON.stringify(data as Todo, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // delete_todo
  tools.set('delete_todo', {
    description: 'Soft-delete a todo by ID. Use permanent=true for hard delete.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'The UUID of the todo to delete' },
        permanent: { type: 'boolean', description: 'If true, permanently deletes the todo (default: false)' },
      },
      required: ['id'],
    },
    handler: async (args) => {
      try {
        const { id, permanent } = args as { id: string; permanent?: boolean };
        validateId(id);

        if (permanent) {
          const { error } = await supabase.from('todos').delete().eq('id', id);
          if (error) throw createDatabaseError(error.message);
          return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Todo '${id}' has been permanently deleted` }, null, 2) }] };
        }

        const { data, error } = await supabase.from('todos').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null).select().single();
        if (error) {
          if (error.code === 'PGRST116') throw createNotFoundError('Todo', id);
          throw createDatabaseError(error.message);
        }

        return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: `Todo '${id}' has been soft-deleted and can be restored` }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // restore_todo
  tools.set('restore_todo', {
    description: 'Restore a soft-deleted todo',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid', description: 'The UUID of the soft-deleted todo to restore' } },
      required: ['id'],
    },
    handler: async (args) => {
      try {
        const { id } = args as { id: string };
        validateId(id);

        const { data: existing, error: checkError } = await supabase.from('todos').select('*').eq('id', id).single();
        if (checkError) {
          if (checkError.code === 'PGRST116') throw createNotFoundError('Todo', id);
          throw createDatabaseError(checkError.message);
        }
        if (!existing.deleted_at) throw createValidationError(`Todo '${id}' is not deleted`);

        const { data, error } = await supabase.from('todos').update({ deleted_at: null }).eq('id', id).select().single();
        if (error) throw createDatabaseError(error.message);

        return { content: [{ type: 'text', text: JSON.stringify(data as Todo, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // mark_complete
  tools.set('mark_complete', {
    description: 'Mark a todo as completed',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid', description: 'The UUID of the todo to mark as complete' } },
      required: ['id'],
    },
    handler: async (args) => {
      try {
        const { id } = args as { id: string };
        validateId(id);

        const { data, error } = await supabase.from('todos').update({ status: 'completed' }).eq('id', id).is('deleted_at', null).select().single();
        if (error) {
          if (error.code === 'PGRST116') throw createNotFoundError('Todo', id);
          throw createDatabaseError(error.message);
        }

        return { content: [{ type: 'text', text: JSON.stringify(data as Todo, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // mark_in_progress
  tools.set('mark_in_progress', {
    description: 'Mark a todo as in progress',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', format: 'uuid', description: 'The UUID of the todo to mark as in progress' } },
      required: ['id'],
    },
    handler: async (args) => {
      try {
        const { id } = args as { id: string };
        validateId(id);

        const { data, error } = await supabase.from('todos').update({ status: 'in_progress' }).eq('id', id).is('deleted_at', null).select().single();
        if (error) {
          if (error.code === 'PGRST116') throw createNotFoundError('Todo', id);
          throw createDatabaseError(error.message);
        }

        return { content: [{ type: 'text', text: JSON.stringify(data as Todo, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // get_categories
  tools.set('get_categories', {
    description: 'List all unique categories currently in use',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const { data, error } = await supabase.from('todos').select('category').eq('user_id', CONSTANTS.DEFAULT_USER_ID).is('deleted_at', null);
        if (error) throw createDatabaseError(error.message);

        const categories = [...new Set(data.map((row: { category: string }) => row.category))].sort();
        return { content: [{ type: 'text', text: JSON.stringify({ categories }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // get_tags
  tools.set('get_tags', {
    description: 'List all unique tags currently in use',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const { data, error } = await supabase.from('todos').select('tags').eq('user_id', CONSTANTS.DEFAULT_USER_ID).is('deleted_at', null).not('tags', 'is', null);
        if (error) throw createDatabaseError(error.message);

        const allTags = data.flatMap((row: { tags: string[] | null }) => row.tags || []);
        const tags = [...new Set(allTags)].sort();
        return { content: [{ type: 'text', text: JSON.stringify({ tags }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // filter_by_date_range
  tools.set('filter_by_date_range', {
    description: 'Filter todos by due date range. All dates in UTC.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date in ISO 8601 format' },
        end_date: { type: 'string', description: 'End date in ISO 8601 format' },
        category: { type: 'string', description: 'Filter by category' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'Filter by status' },
      },
    },
    handler: async (args) => {
      try {
        const params = args as Record<string, unknown>;
        const startDate = params.start_date ? validateDueDate(params.start_date) : undefined;
        const endDate = params.end_date ? validateDueDate(params.end_date) : undefined;
        const category = params.category ? validateCategory(params.category) : undefined;
        const status = params.status ? validateStatus(params.status) : undefined;

        let query = supabase
          .from('todos')
          .select('*')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .is('deleted_at', null)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true });

        if (startDate) query = query.gte('due_date', startDate);
        if (endDate) query = query.lte('due_date', endDate);
        if (category) query = query.eq('category', category);
        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw createDatabaseError(error.message);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: (data as Todo[]).length,
              filters: { start_date: startDate || null, end_date: endDate || null, category: category || null, status: status || null },
              todos: data,
            }, null, 2),
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  // search_todos
  tools.set('search_todos', {
    description: 'Full-text search on title and description',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, description: 'Search query' },
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Number of results (default: 20)' },
      },
      required: ['query'],
    },
    handler: async (args) => {
      try {
        const params = args as { query: string; limit?: number };
        if (!params.query || typeof params.query !== 'string') throw createValidationError('Search query is required');

        const searchQuery = params.query.trim();
        if (searchQuery.length === 0) throw createValidationError('Search query cannot be empty');

        const limit = validateLimit(params.limit ?? 20);

        const { data, error } = await supabase
          .from('todos')
          .select('*')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .is('deleted_at', null)
          .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw createDatabaseError(error.message);

        return { content: [{ type: 'text', text: JSON.stringify({ query: searchQuery, count: (data as Todo[]).length, todos: data }, null, 2) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: formatErrorResponse(error) }], isError: true };
      }
    },
  });

  return tools;
}
