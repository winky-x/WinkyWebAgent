import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase (Global scope to reuse connection)
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const server = new Server(
  { name: "winky-web-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Define Tools
server.setRequestHandler({ method: "tools/list" }, async () => ({
  tools: [
    {
      name: "web_agent",
      description: "Triggers a browser action",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string" },
          url: { type: "string" }
        }
      }
    }
  ]
}));

// Global transport reference for POST messages
let transport: SSEServerTransport | null = null;

export default async function handler(req: any, res: any) {
  // Set headers for SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none'); // Prevents Vercel from compressing/buffering

  if (req.method === "GET") {
    transport = new SSEServerTransport("/api/mcp", res);
    
    try {
      await server.connect(transport);
      
      // Keep the serverless function alive
      // The 300s limit starts now
      console.log("MCP SSE Connection Established");
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
      console.error("POST Error:", err);
      res.status(500).end();
    }
  }
}
