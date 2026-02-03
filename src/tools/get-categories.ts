import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { formatErrorResponse, createDatabaseError } from '../utils/errors.js';
import { CONSTANTS } from '../config/constants.js';

export function registerGetCategories(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'get_categories',
    'List all unique categories currently in use',
    {},
    async () => {
      try {
        const { data, error } = await supabase
          .from('todos')
          .select('category')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .is('deleted_at', null);

        if (error) {
          throw createDatabaseError(error.message);
        }

        // Extract unique categories
        const categories = [...new Set(data.map(row => row.category))].sort();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ categories }, null, 2),
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
