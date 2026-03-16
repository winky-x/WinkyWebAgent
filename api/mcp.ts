import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class MCPClient {
  private client: Client;
  private transport: SSEClientTransport | null = null;
  private tools: Map<string, any> = new Map();
  private connectionPromise: Promise<boolean> | null = null;

  constructor() {
    this.client = new Client(
      {
        name: "winky-web-agent-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
  }

  async connect(): Promise<boolean> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    if (this.transport && this.tools.size > 0) {
      return true;
    }

    this.connectionPromise = this.doConnect();
    try {
      const result = await this.connectionPromise;
      return result;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async doConnect(): Promise<boolean> {
    try {
      const serverUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000/api/mcp'
        : '/api/mcp';

      console.log('Connecting to MCP server at:', serverUrl);
      
      this.transport = new SSEClientTransport(new URL(serverUrl));
      await this.client.connect(this.transport);
      
      const result = await this.client.request(
        { method: "tools/list" },
        {}
      );
      
      this.tools.clear();
      if (result.tools) {
        result.tools.forEach((tool: any) => {
          this.tools.set(tool.name, tool);
        });
        console.log('Available MCP tools:', Array.from(this.tools.keys()));
      }
      
      return true;
    } catch (error) {
      console.error('Failed to connect to MCP server:', error);
      this.transport = null;
      return false;
    }
  }

  async callTool(toolName: string, args: any) {
    const connected = await this.connect();
    if (!connected) {
      throw new Error('MCP server not available');
    }

    if (!this.tools.has(toolName)) {
      throw new Error(`Tool ${toolName} not available`);
    }

    const result = await this.client.request(
      {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: args
        }
      },
      {}
    );

    return result;
  }

  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this.tools.clear();
    this.connectionPromise = null;
  }

  getAvailableTools() {
    return Array.from(this.tools.values());
  }

  isConnected() {
    return this.transport !== null && this.tools.size > 0;
  }
}

export const mcpClient = new MCPClient();
