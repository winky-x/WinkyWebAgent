import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createClient } from "@supabase/supabase-js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// 1. Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 2. Create the MCP Server
const server = new Server(
  { name: "winky-web-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 3. Register Tools (Fixed Syntax)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "web_agent",
      description: "Triggers a browser action via Supabase broadcast",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "The action to perform" },
          url: { type: "string", description: "The target URL" },
          selector: { type: "string", description: "CSS selector" }
        },
        required: ["action"]
      }
    }
  ]
}));

// 4. Handle Tool Calls (Fixed Syntax & Supabase Logic)
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "web_agent") {
    const jobId = Math.random().toString(36).substring(7);
    
    // In Supabase v2, .send() returns the status string ("ok", "timed out", etc.)
    const status = await supabase.channel('browser-actions').send({
      type: 'broadcast',
      event: 'action',
      payload: { jobId, ...args }
    });

    if (status !== 'ok') {
      return {
        isError: true,
        content: [{ type: "text", text: `Supabase broadcast failed with status: ${status}` }]
      };
    }

    return {
      content: [{ type: "text", text: `Web agent task started. Job ID: ${jobId}` }]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// 5. Vercel SSE Transport Logic
let transport: SSEServerTransport | null = null;

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none');

  if (req.method === "GET") {
    transport = new SSEServerTransport("/api/mcp", res);
    
    try {
      await server.connect(transport);
      
      // Keep connection alive for Vercel
      await new Promise((resolve) => {
        req.on("close", () => {
          transport = null;
          resolve(null);
        });
      });
    } catch (err) {
      console.error("Connection Error:", err);
      if (!res.writableEnded) res.status(500).end();
    }
  } 
  else if (req.method === "POST") {
    if (!transport) {
      return res.status(400).json({ error: "No active SSE session" });
    }
    
    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      res.status(500).end();
    }
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
}
