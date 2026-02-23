import { corsHeaders } from '../utils/cors.js';

export function handleSSE(
  request: Request,
): Response {
  const url = new URL(request.url);

  // Handle GET request for SSE connection
  if (request.method === 'GET') {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Send initial connection event
    writer.write(encoder.encode(`event: endpoint\ndata: ${url.pathname}/message\n\n`));

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    });
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: corsHeaders,
  });
}
