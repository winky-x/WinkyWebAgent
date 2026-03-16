import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { executeTool, toolDeclarations } from "./src/lib/tools.js";
import { Redis } from "@upstash/redis";
import express from "express";
import cors from "cors";

const execAsync = promisify(exec);

// GLOBAL STATE
let AGENT_CONFIG = { mode: 'LOCAL' as 'LOCAL' | 'EXTENSION' };
let browserContext: any = null;
let currentPage: any = null;

// Initialize Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "https://your-upstash-url.upstash.io",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || "your-token",
});

const server = new Server(
  { name: "visual-web-agent", version: "1.2.0" },
  { capabilities: { tools: {} } }
);

// Define tools
const toggleModeSchema = {
  name: "toggle_agent_mode",
  description: "Switches the agent mode between 'LOCAL' (Playwright) and 'EXTENSION' (Chrome Extension).",
  inputSchema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["LOCAL", "EXTENSION"],
        description: "The mode to switch to."
      }
    },
    required: ["mode"]
  }
};

const webAgentSchema = {
  name: "web_agent",
  description: "A tool that controls a VISIBLE browser on the user's PC. Use this to navigate, login, and interact with sites like Instagram or Gmail.\n\n⚠️ ERROR HANDLING & TROUBLESHOOTING RULES:\n- 'Selector Not Found': If a click fails, it will auto-retry with force-click or double-click. If still failing, use a screenshot to find coordinates and pass x, y.\n- 'Login Required': If the screenshot shows a login page, STOP and tell the user: 'Please log in manually in the opened browser window. I will wait.'\n- 'Zombie Process': If the server crashes, use the cleanup_browser tool.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["navigate", "click", "type", "screenshot", "wait"],
        description: "The action to perform"
      },
      url: { type: "string", description: "The URL to navigate to (required for 'navigate')" },
      selector: { type: "string", description: "The CSS selector to interact with (required for 'click' and 'type')" },
      text: { type: "string", description: "The text to type (required for 'type')" },
      x: { type: "number", description: "X coordinate for click (fallback if selector is hidden)" },
      y: { type: "number", description: "Y coordinate for click (fallback if selector is hidden)" }
    },
    required: ["action"]
  }
};

const cleanupBrowserSchema = {
  name: "cleanup_browser",
  description: "Kills zombie browser processes (Chromium/Chrome) if the agent gets stuck or the browser becomes unresponsive.",
  inputSchema: { type: "object", properties: {} }
};

const existingTools = toolDeclarations.map(tool => {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  if (tool.parameters?.properties) {
    for (const [key, prop] of Object.entries(tool.parameters.properties)) {
      properties[key] = { type: prop.type.toLowerCase(), description: prop.description };
    }
  }
  if (tool.parameters?.required) required.push(...tool.parameters.required);
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { type: "object", properties, required: required.length > 0 ? required : undefined }
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: [toggleModeSchema, webAgentSchema, cleanupBrowserSchema, ...existingTools] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "toggle_agent_mode") {
    const { mode } = args as any;
    AGENT_CONFIG.mode = mode;
    return { content: [{ type: "text", text: `Agent mode switched to ${mode}` }] };
  }

  if (name === "cleanup_browser") {
    try {
      const cmd = process.platform === 'win32' ? 'taskkill /F /IM chrome.exe /T' : 'pkill -f chromium || pkill -f chrome';
      await execAsync(cmd);
      browserContext = null;
      currentPage = null;
      return { content: [{ type: "text", text: "Browser processes terminated successfully." }] };
    } catch (error: any) {
      return { isError: true, content: [{ type: "text", text: `Failed to kill browser processes: ${error.message}` }] };
    }
  }

  if (name === "web_agent") {
    const { action, url, selector, text, x, y } = args as any;

    if (AGENT_CONFIG.mode === 'EXTENSION') {
      // Check if extension is connected by checking a heartbeat key in Redis
      const lastHeartbeat = await redis.get<number>("extension_heartbeat");
      if (!lastHeartbeat || Date.now() - lastHeartbeat > 30000) {
        return { isError: true, content: [{ type: "text", text: "Error: Please open the Chrome Extension to proceed in Web Mode." }] };
      }

      const jobId = crypto.randomUUID();
      const payload = { jobId, action, url, selector, text, x, y };
      
      // Add to pending jobs queue
      await redis.rpush("pending_jobs", JSON.stringify(payload));

      // Wait for result
      let attempts = 0;
      while (attempts < 30) { // Wait up to 30 seconds
        await new Promise(r => setTimeout(r, 1000));
        const resultStr = await redis.get<string>(`result:${jobId}`);
        if (resultStr) {
          const result = typeof resultStr === 'string' ? JSON.parse(resultStr) : resultStr;
          if (result.error) {
            return { isError: true, content: [{ type: "text", text: `Error during ${action}: ${result.error}` }] };
          }
          
          const content: any[] = [
            { type: "text", text: `Action '${action}' successful. Task Complete. View the result in the open tab. Current URL: ${result.url}` }
          ];
          if (result.screenshot) {
            content.push({ type: "image", data: result.screenshot, mimeType: "image/png" });
          }
          return { content };
        }
        attempts++;
      }
      return { isError: true, content: [{ type: "text", text: "Error: Timeout waiting for Chrome Extension response." }] };
    }

    // LOCAL MODE (Playwright)
    if (!browserContext) {
      const { chromium } = await import("playwright");
      const userDataPath = path.join(process.cwd(), "user_data");
      browserContext = await chromium.launchPersistentContext(userDataPath, {
        headless: false,
        viewport: null,
        args: ["--no-sandbox", "--start-maximized"]
      });
      currentPage = browserContext.pages()[0] || await browserContext.newPage();
    }

    try {
      await currentPage!.bringToFront();

      if (action === "navigate" && url) {
        await currentPage!.goto(url, { waitUntil: "networkidle" });
        await currentPage!.waitForTimeout(3000);
        const loginElements = await currentPage!.$$('input[type="password"], input[name="password"], [name="username"], [name="email"], form[action*="login"]');
        if (loginElements.length > 0) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ status: "AWAITING_USER_LOGIN", message: "Please log in on the visible browser window now." }) }]
          };
        }
      } else if (action === "click") {
        if (x !== undefined && y !== undefined) {
          await currentPage!.mouse.click(x, y);
        } else if (selector) {
          try {
            await currentPage!.click(selector, { timeout: 3000 });
          } catch (e) {
            try {
              await currentPage!.click(selector, { force: true, timeout: 3000 });
            } catch (e2) {
              await currentPage!.dblclick(selector, { force: true, timeout: 3000 });
            }
          }
        } else {
          throw new Error("Click action requires either a 'selector' or 'x' and 'y' coordinates.");
        }
      } else if (action === "type" && selector && text) {
        try {
          await currentPage!.fill(selector, text, { timeout: 3000 });
        } catch (e) {
          await currentPage!.fill(selector, text, { force: true, timeout: 3000 });
        }
        await currentPage!.keyboard.press("Enter");
      } else if (action === "wait") {
        await currentPage!.waitForTimeout(3000);
      }

      const screenshot = await currentPage!.screenshot({ encoding: "base64" });
      return {
        content: [
          { type: "text", text: `Action '${action}' successful. Task Complete. View the result in the open tab. Current URL: ${currentPage!.url()}` },
          { type: "image", data: screenshot, mimeType: "image/png" }
        ]
      };
    } catch (error: any) {
      return { isError: true, content: [{ type: "text", text: `Error during ${action}: ${error.message}` }] };
    }
  } else {
    const toolExists = existingTools.find(t => t.name === name);
    if (toolExists) {
      try {
        const result = await executeTool(name, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { isError: true, content: [{ type: "text", text: `Error executing ${name}: ${error.message}` }] };
      }
    }
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
});

// Express App Setup for MCP SSE and Extension Polling
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(500).send("Transport not initialized");
  }
});

// Extension Endpoints
app.post("/api/extension/heartbeat", async (req, res) => {
  await redis.set("extension_heartbeat", Date.now());
  res.json({ success: true });
});

app.get("/api/extension/poll", async (req, res) => {
  // Simple polling: pop from a list or just check a specific key
  // For a robust implementation, the extension should probably subscribe to SSE or long-poll.
  // Here we just check if there's a pending job.
  // In a real scenario, we'd use Redis lists (lpop).
  const jobStr = await redis.lpop<string>("pending_jobs");
  if (jobStr) {
    res.json({ job: typeof jobStr === 'string' ? JSON.parse(jobStr) : jobStr });
  } else {
    res.json({ job: null });
  }
});

app.post("/api/extension/result", async (req, res) => {
  const { jobId, result } = req.body;
  await redis.set(`result:${jobId}`, JSON.stringify(result), { ex: 60 });
  res.json({ success: true });
});

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Visual Web Agent MCP Server running on port ${PORT}`);
    console.log(`SSE Endpoint: http://localhost:${PORT}/sse`);
  });
}

export default app;
