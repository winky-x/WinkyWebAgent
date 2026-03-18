import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createClient } from "@supabase/supabase-js";

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
// @ts-ignore
server.setRequestHandler({ method: "tools/list" }, async () => ({
  tools: [] // FIX: Added empty array instead of leaving it blank
}));

// 4. Handle Tool Calls
// @ts-ignore
server.setRequestHandler({ method: "tools/call" }, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === "web_agent") {
    const jobId = Math.random().toString(36).substring(7);
    await supabase.channel('browser-actions').send({
      type: 'broadcast',
      event: 'action',
      payload: { jobId, ...args }
    });
    return {
      content: [{ type: "text", text: `Job ${jobId} initiated.` }] // FIX: Added content array
    };
  }
  return { 
    isError: true, 
    content: [{ type: "text", text: "Unknown tool" }] // FIX: Added content array
  };
});

// 5. The Vercel Handler
export default async function handler(req: any, res: any) {
  const transport = new SSEServerTransport("/api/mcp", res);
  // @ts-ignore
  await server.connect(transport);
  if (req.method === 'POST') {
    // @ts-ignore
    await transport.handlePostMessage(req, res);
  }
}
