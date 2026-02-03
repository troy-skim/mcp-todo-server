import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SupabaseClient } from '@supabase/supabase-js';
import { formatErrorResponse, createDatabaseError } from '../utils/errors.js';
import { CONSTANTS } from '../config/constants.js';

export function registerGetTags(server: McpServer, supabase: SupabaseClient): void {
  server.tool(
    'get_tags',
    'List all unique tags currently in use',
    {},
    async () => {
      try {
        const { data, error } = await supabase
          .from('todos')
          .select('tags')
          .eq('user_id', CONSTANTS.DEFAULT_USER_ID)
          .is('deleted_at', null)
          .not('tags', 'is', null);

        if (error) {
          throw createDatabaseError(error.message);
        }

        // Flatten and extract unique tags
        const allTags = data.flatMap(row => row.tags || []);
        const tags = [...new Set(allTags)].sort();

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ tags }, null, 2),
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
