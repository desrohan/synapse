import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { graphService, type GraphPayload } from '../db/graph.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Creates AI SDK tools scoped to a specific user.
 */
export function createUserTools(userId: string) {
  return {
    searchGraph: tool({
      description: 'Search the knowledge graph memory for relevant context. Returns nodes (entities) and edges (relationships) that match the criteria.',
      inputSchema: zodSchema(z.object({
        query: z.string().optional().describe('Text to search for within node properties (e.g., ticket title, person name).'),
        nodeType: z.string().optional().describe('Entity type to filter by (e.g., Ticket, Person, Message).'),
      })),
      execute: async ({ query, nodeType }) => {
        let q = supabase.from('graph_nodes').select('*').eq('user_id', userId);

        if (nodeType) {
          q = q.eq('type', nodeType);
        }

        q = q.order('updated_at', { ascending: false }).limit(20);

        const { data: nodes, error: nodeError } = await q;

        if (nodeError || !nodes) {
          console.error('searchGraph node error:', nodeError);
          return { error: 'Failed to search graph nodes' };
        }

        if (nodes.length === 0) return { nodes: [], edges: [] };

        const nodeIds = nodes.map(n => n.id);
        const { data: edges } = await supabase
          .from('graph_edges')
          .select('*')
          .or(`source_node_id.in.(${nodeIds.join(',')}),target_node_id.in.(${nodeIds.join(',')})`)
          .eq('user_id', userId);

        let filteredNodes = nodes;
        if (query) {
          const lowerQuery = query.toLowerCase();
          filteredNodes = nodes.filter(n => JSON.stringify(n.properties).toLowerCase().includes(lowerQuery));
        }

        return { nodes: filteredNodes, edges: edges || [] };
      },
    }),

    writeMemory: tool({
      description: 'Write new information to the knowledge graph memory. Use this when the user asks you to remember something.',
      inputSchema: zodSchema(z.object({
        nodes: z.array(z.object({
          type: z.string().describe('Type of the node, e.g. Person, Ticket, Message, Project'),
          external_id: z.string().describe('A unique logical identifier for this entity'),
          properties: z.record(z.string(), z.unknown()).describe('Attributes to remember'),
        })),
        edges: z.array(z.object({
          source_external_id: z.string(),
          target_external_id: z.string(),
          relation_type: z.string().describe('e.g., BLOCKED_BY, WORKS_ON'),
          properties: z.record(z.string(), z.any()).optional(),
        })),
      })),
      execute: async (payload) => {
        try {
          await graphService.upsertGraph({ ...payload, userId });
          return { success: true, message: `Saved ${payload.nodes?.length || 0} nodes and ${payload.edges?.length || 0} edges to memory.` };
        } catch (err: any) {
          console.error('writeMemory error:', err);
          return { success: false, error: err.message };
        }
      },
    }),
  };
}
