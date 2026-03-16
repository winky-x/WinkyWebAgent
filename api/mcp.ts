import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const server = new Server(
  { name: "winky-web-agent", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 1. Register the tool list (The OLD way for 1.25.2)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools:
}));

// 2. Handle the tool call
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "web_agent") {
    const jobId = Math.random().toString(36).substring(7);
    await supabase.channel('browser-actions').send({
      type: 'broadcast',
      event: 'action',
      payload: { jobId, ...request.params.arguments }
    });
    return {
      content:
    };
  }
  throw new Error("Tool not found");
});

// 3. Vercel Handler
export default async function handler(req: any, res: any) {
  const transport = new SSEServerTransport("/api/mcp", res);
  await server.connect(transport);
  if (req.method === 'POST') {
    // @ts-ignore
    await server.connect(transport);
    // @ts-ignore
    await transport.handlePostMessage(req, res);
  }
}
