export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  MCP_SERVER_NAME: string;
  ALLOWED_ORIGINS: string;
}

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
