import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { mcpManager } from '../mcp/index.js';

/**
 * Converts a JSON Schema property to a Zod schema.
 */
function jsonSchemaToZod(prop: any): z.ZodTypeAny {
  if (!prop) return z.unknown();

  switch (prop.type) {
    case 'string':
      return prop.description ? z.string().describe(prop.description) : z.string();
    case 'number':
    case 'integer':
      return prop.description ? z.number().describe(prop.description) : z.number();
    case 'boolean':
      return prop.description ? z.boolean().describe(prop.description) : z.boolean();
    case 'array':
      return prop.description
        ? z.array(jsonSchemaToZod(prop.items || {})).describe(prop.description)
        : z.array(jsonSchemaToZod(prop.items || {}));
    case 'object':
      if (prop.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [k, v] of Object.entries<any>(prop.properties)) {
          shape[k] = prop.required?.includes(k) ? jsonSchemaToZod(v) : jsonSchemaToZod(v).optional();
        }
        return prop.description ? z.object(shape).describe(prop.description) : z.object(shape);
      }
      return prop.description ? z.record(z.string(), z.unknown()).describe(prop.description) : z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

/**
 * Extracts the provider name from a client name like "jira-userId123".
 */
function getProvider(clientName: string): string {
  return clientName.split('-')[0];
}

/**
 * Fetches MCP tools for a specific user and returns them as AI SDK tool definitions.
 */
export async function getMCPToolsForUser(userId: string): Promise<Record<string, any>> {
  const allClientNames = mcpManager.getAllClientNames();
  const userClients = allClientNames.filter(name => name.endsWith(userId));
  const tools: Record<string, any> = {};

  for (const clientName of userClients) {
    const provider = getProvider(clientName);

    try {
      const result = await mcpManager.listTools(clientName);

      for (const mcpTool of result.tools) {
        const safeName = `${provider}_${mcpTool.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        const inputSchema = mcpTool.inputSchema as any;

        // Build Zod schema from the MCP tool's JSON Schema
        let params: z.ZodTypeAny;
        if (inputSchema?.properties && Object.keys(inputSchema.properties).length > 0) {
          const shape: Record<string, z.ZodTypeAny> = {};
          for (const [k, v] of Object.entries<any>(inputSchema.properties)) {
            shape[k] = inputSchema.required?.includes(k) ? jsonSchemaToZod(v) : jsonSchemaToZod(v).optional();
          }
          params = z.object(shape);
        } else {
          params = z.object({});
        }

        tools[safeName] = tool({
          description: `[${provider.toUpperCase()}] ${mcpTool.description || mcpTool.name}`,
          inputSchema: zodSchema(params),
          execute: async (args) => {
            const mcpResponse = await mcpManager.callTool(clientName, mcpTool.name, args || {});
            if (mcpResponse.content && Array.isArray(mcpResponse.content)) {
              // Try to parse JSON from MCP text responses for structured results
              const text = mcpResponse.content.map((c: any) => c.text).join('\n');
              try {
                return JSON.parse(text);
              } catch {
                return { content: text };
              }
            }
            return mcpResponse;
          },
        });
      }
    } catch (err) {
      console.error(`Failed to load tools for MCP client ${clientName}:`, err);
    }
  }

  return tools;
}
