import { createMcpHandler } from "mcp-handler";
// Import your actual server logic from where you defined the tools
import { server } from "../mcp-server"; 

// This creates the GET and POST endpoints Vercel needs
const handler = createMcpHandler(server, {
  basePath: "/api/mcp",
  maxDuration: 300, // Matches your vercel.json
});

export { handler as GET, handler as POST };
