import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { corsHeaders } from '../utils/cors.js';

export async function handleSSE(
  request: Request,
  server: McpServer
): Promise<Response> {
  const url = new URL(request.url);

  // Handle GET request for SSE connection
  if (request.method === 'GET') {
    const transport = new SSEServerTransport('/sse', new Response());

    await server.connect(transport);

    // Create SSE response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Set up SSE connection
    const response = new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });

    // Send initial connection event
    writer.write(encoder.encode(`event: endpoint\ndata: ${url.pathname}/message\n\n`));

    return response;
  }

  // Handle POST request for messages
  if (request.method === 'POST' && url.pathname.endsWith('/message')) {
    const body = await request.text();
    const transport = new SSEServerTransport('/sse', new Response());

    await server.connect(transport);

    // Process the message
    try {
      await transport.handlePostMessage(request);
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to process message' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: corsHeaders,
  });
}
