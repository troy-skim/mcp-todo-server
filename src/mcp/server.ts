import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { registerAddTodo } from '../tools/add-todo.js';
import { registerListTodos } from '../tools/list-todos.js';
import { registerGetTodo } from '../tools/get-todo.js';
import { registerUpdateTodo } from '../tools/update-todo.js';
import { registerDeleteTodo } from '../tools/delete-todo.js';
import { registerRestoreTodo } from '../tools/restore-todo.js';
import { registerMarkComplete } from '../tools/mark-complete.js';
import { registerMarkInProgress } from '../tools/mark-in-progress.js';
import { registerGetCategories } from '../tools/get-categories.js';
import { registerGetTags } from '../tools/get-tags.js';
import { registerFilterByDateRange } from '../tools/filter-by-date-range.js';
import { registerSearchTodos } from '../tools/search-todos.js';

export function createMCPServer(supabase: SupabaseClient): McpServer {
  const server = new McpServer({
    name: 'todo-server',
    version: '1.0.0',
  });

  // Register all tools
  registerAddTodo(server, supabase);
  registerListTodos(server, supabase);
  registerGetTodo(server, supabase);
  registerUpdateTodo(server, supabase);
  registerDeleteTodo(server, supabase);
  registerRestoreTodo(server, supabase);
  registerMarkComplete(server, supabase);
  registerMarkInProgress(server, supabase);
  registerGetCategories(server, supabase);
  registerGetTags(server, supabase);
  registerFilterByDateRange(server, supabase);
  registerSearchTodos(server, supabase);

  return server;
}
