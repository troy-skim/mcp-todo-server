import { createSupabaseClient } from './supabase/client.js';
import { handleCorsPreflightRequest, corsHeaders } from './utils/cors.js';
import { createTools } from './tools/index.js';
import type { Env } from './types/mcp.js';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCorsPreflightRequest();
    }

    try {
      // Health check endpoint
      if (url.pathname === '/' || url.pathname === '/health') {
        return new Response(
          JSON.stringify({
            status: 'ok',
            server: 'mcp-todo-server',
            version: '1.0.0',
            endpoints: {
              mcp: '/mcp',
              sse: '/sse',
            },
          }),
          {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        );
      }

      // Initialize Supabase client
      const supabase = createSupabaseClient(env);

      // Create tools registry
      const tools = createTools(supabase);

      // Route based on path
      if (url.pathname === '/mcp' || url.pathname === '/mcp/') {
        return await handleMCPRequest(request, tools);
      }

      if (url.pathname === '/sse') {
        return handleSSEConnection(url);
      }

      if (url.pathname === '/sse/message') {
        return await handleSSEMessage(request, tools);
      }

      // 404 for unknown routes
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    } catch (error) {
      console.error('Server error:', error);
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      );
    }
  },
};

interface Tool {
  description: string;
  inputSchema: unknown;
  handler: (args: unknown) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

type ToolsMap = Map<string, Tool>;

async function handleMCPRequest(request: Request, tools: ToolsMap): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }

  try {
    const body = await request.json() as { jsonrpc: string; id: number | string; method: string; params?: unknown };
    const result = await handleJsonRpcRequest(tools, body);

    return new Response(
      JSON.stringify(result),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: 'Parse error',
          data: error instanceof Error ? error.message : 'Unknown error',
        },
        id: null,
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
}

async function handleJsonRpcRequest(
  tools: ToolsMap,
  request: { jsonrpc: string; id: number | string; method: string; params?: unknown }
): Promise<unknown> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize': {
        const initParams = params as { protocolVersion?: string } | undefined;
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: initParams?.protocolVersion || '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'todo-server', version: '1.0.0' },
          },
        };
      }

      case 'notifications/initialized': {
        return { jsonrpc: '2.0', id, result: {} };
      }

      case 'tools/list': {
        const toolList = Array.from(tools.entries()).map(([name, tool]) => ({
          name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        }));

        return {
          jsonrpc: '2.0',
          id,
          result: { tools: toolList },
        };
      }

      case 'tools/call': {
        const callParams = params as { name: string; arguments?: Record<string, unknown> };
        const toolName = callParams?.name;
        const toolArgs = callParams?.arguments || {};

        const tool = tools.get(toolName);

        if (!tool) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Tool not found: ${toolName}`,
            },
          };
        }

        const result = await tool.handler(toolArgs);
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

function handleSSEConnection(url: URL): Response {
  const sessionId = crypto.randomUUID();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Send endpoint event
  const messageEndpoint = `${url.origin}/sse/message?sessionId=${sessionId}`;
  writer.write(encoder.encode(`event: endpoint\ndata: ${messageEndpoint}\n\n`));

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...corsHeaders,
    },
  });
}

async function handleSSEMessage(request: Request, tools: ToolsMap): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json() as { jsonrpc: string; id: number | string; method: string; params?: unknown };
    const result = await handleJsonRpcRequest(tools, body);

    return new Response(
      JSON.stringify(result),
      {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to process message' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
}
