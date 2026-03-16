import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// 1. Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 2. Wrap the server logic in a function for mcp-handler
const handler = createMcpHandler(async (server: McpServer) => {
  // Define the Web Agent Tool inside the setup function
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
});

// 3. Export the Vercel Handler
export { handler as GET, handler as POST };
