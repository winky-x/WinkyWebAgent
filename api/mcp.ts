import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// 1. Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 2. Define the McpServer (Note the change from 'Server' to 'McpServer')
const server = new McpServer({
  name: "winky-web-agent",
  version: "1.0.0",
});

// 3. Define the Web Agent Tool
server.tool(
  "web_agent",
  "Controls a browser via Chrome Extension + Supabase",
  {
    action: z.enum(["navigate", "click", "type"]),
    url: z.string().optional(),
    selector: z.string().optional(),
    text: z.string().optional(),
  },
  async ({ action, url, selector, text }) => {
    const jobId = Math.random().toString(36).substring(7);
    
    // Broadcast to Supabase
    await supabase.channel('browser-actions').send({
      type: 'broadcast',
      event: 'action',
      payload: { jobId, action, url, selector, text }
    });

    return {
      content:
    };
  }
);

// 4. Export the Vercel Handler
const handler = createMcpHandler(server);
export { handler as GET, handler as POST };
