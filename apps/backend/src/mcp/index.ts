import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class MCPManager {
  private clients: Map<string, Client> = new Map();

  async connectStdioServer(name: string, command: string, args: string[], env?: Record<string, string | undefined>) {
    const transport = new StdioClientTransport({
      command,
      args,
      env: env ? { ...process.env, ...env } as Record<string, string> : process.env as Record<string, string>,
    });

    const client = new Client({
      name: `synapse-${name}-client`,
      version: '1.0.0',
    }, {
      capabilities: {}
    });

    await client.connect(transport);
    this.clients.set(name, client);
    console.log(`Connected to MCP server: ${name}`);
    return client;
  }

  getAllClientNames(): string[] {
    return Array.from(this.clients.keys());
  }

  getClient(name: string) {
    return this.clients.get(name);
  }

  async listTools(name: string) {
    const client = this.getClient(name);
    if (!client) throw new Error(`Client ${name} not found`);
    return await client.listTools();
  }

  async callTool(name: string, toolName: string, args: any) {
    const client = this.getClient(name);
    if (!client) throw new Error(`Client ${name} not found`);
    return await client.callTool({
      name: toolName,
      arguments: args
    });
  }

  async disconnectServer(name: string) {
    const client = this.clients.get(name);
    if (client) {
      await client.close();
      this.clients.delete(name);
      console.log(`Disconnected MCP server: ${name}`);
    }
  }
}

export const mcpManager = new MCPManager();
