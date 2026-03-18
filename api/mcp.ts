import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createClient } from "@supabase/supabase-js";

// 1. Initialize Supabase
// Ensure these are set in your Vercel Environment Variables
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 2. Create the MCP Server
const server = new Server(
  { name: "winky-web-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 3. Register Tools
server.setRequestHandler({ method: "tools/list" }, async () => ({
  tools: [
    {
      name: "web_agent",
      description: "Triggers a browser action via Supabase broadcast",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", description: "The action to perform (e.g., click, type, navigate)" },
          url: { type: "string", description: "The target URL" },
          selector: { type: "string", description: "CSS selector if applicable" }
        },
        required: ["action"]
      }
    }
  ]
}));

// 4. Handle Tool Calls
server.setRequestHandler({ method: "tools/call" }, async (request) => {
  const { name, arguments: args } = request.params as any;
  
  if (name === "web_agent") {
    const jobId = Math.random().toString(36).substring(7);
    
    // Broadcast to Supabase so your browser extension/client can pick it up
    const { error } = await supabase.channel('browser-actions').send({
      type: 'broadcast',
      event: 'action',
      payload: { jobId, ...args }
    });

    if (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `Supabase Error: ${error.message}` }]
      };
    }

    return {
      content: [{ type: "text", text: `Web agent task started. Job ID: ${jobId}` }]
    };
  }
  
  return {
    isError: true,
    content: [{ type: "text", text: `Unknown tool: ${name}` }]
  };
});

// 5. Vercel SSE Transport Logic
// We keep a reference to the transport in the global scope
let transport: SSEServerTransport | null = null;

export default async function handler(req: any, res: any) {
  // Critical Headers for Vercel/SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Content-Encoding', 'none');

  if (req.method === "GET") {
    // Initialize the SSE Transport
    transport = new SSEServerTransport("/api/mcp", res);
    
    try {
      await server.connect(transport);
      console.log("MCP SSE Connection Established");

      // Keep the function alive until the client closes the connection
      // or the Vercel maxDuration (300s) is reached.
      await new Promise((resolve) => {
        req.on("close", () => {
          console.log("Client closed connection.");
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
    // For POST requests, we need the existing transport session
    if (!transport) {
      return res.status(400).json({ 
        error: "No active SSE session found. High chance of Serverless Cold Start/Zombie session." 
      });
    }
    
    try {
      await transport.handlePostMessage(req, res);
    } catch (err) {
      console.error("POST Error:", err);
      if (!res.writableEnded) res.status(500).end();
    }
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
}
