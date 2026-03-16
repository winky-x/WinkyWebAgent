import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 1. Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 2. Create the Server
const server = new Server(
  { name: "winky-web-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 3. Register Tools
server.setRequestHandler({ method: "tools/list" }, async () => ({
  tools: [
    {
      name: "web_agent",
      description: "Execute web browser automation tasks",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to" },
          action: { type: "string", description: "The action to perform" },
          selector: { type: "string", description: "CSS selector for element" },
          value: { type: "string", description: "Value to input" }
        },
        required: ["url", "action"]
      }
    }
  ]
}));

// 4. Handle Tool Calls
server.setRequestHandler({ method: "tools/call" }, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "web_agent") {
    const jobId = Math.random().toString(36).substring(7);
    
    // Store job in Supabase
    await supabase
      .from('jobs')
      .insert({
        id: jobId,
        status: 'pending',
        args: args
      });

    // Broadcast to browser clients
    await supabase.channel('browser-actions').send({
      type: 'broadcast',
      event: 'action',
      payload: { jobId, ...args }
    });

    return {
      content: [
        {
          type: "text",
          text: `Job submitted successfully with ID: ${jobId}`
        }
      ]
    };
  }
  
  return { 
    isError: true, 
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}`
      }
    ]
  };
});

// 5. The Vercel Handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('MCP handler called', { 
    method: req.method, 
    url: req.url,
    headers: req.headers 
  });

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const transport = new SSEServerTransport("/api/mcp", res);
    await server.connect(transport);
    
    if (req.method === 'POST') {
      await transport.handlePostMessage(req, res);
    } else if (req.method === 'GET') {
      // SSE connection
      console.log('SSE connection established');
    }
  } catch (error) {
    console.error('Error in MCP handler:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
