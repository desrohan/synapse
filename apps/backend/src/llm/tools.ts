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

    generateReport: tool({
      description: `Generate a structured workspace report/brief. Use this tool WHENEVER you have gathered workspace data (from Slack, Jira, or GitHub) and need to present it to the user. Instead of writing markdown directly, call this tool with structured data and it will render a beautiful report UI.

Call this tool AFTER you have fetched all data from other tools. Pass the data organized into sections.`,
      inputSchema: zodSchema(z.object({
        title: z.string().describe('Report title, e.g. "Daily Brief", "Slack Update", "Sprint Summary"'),
        subtitle: z.string().optional().describe('Subtitle or date range, e.g. "Last 24 hours · May 31, 2026"'),
        actionItems: z.array(z.object({
          title: z.string().describe('Short headline of the action item (5-10 words)'),
          description: z.string().describe('1-2 sentence summary of what needs to be done'),
          source: z.string().describe('Where this came from: "slack", "jira", or "github"'),
          permalink: z.string().optional().describe('Link to the original message/issue'),
        })).optional().describe('Items requiring the user\'s action — mentions, requests, reviews'),
        updates: z.array(z.object({
          title: z.string().describe('Short headline summarizing the update (5-10 words)'),
          description: z.string().describe('1-2 sentence summary'),
          source: z.string().describe('"slack", "jira", or "github"'),
          permalink: z.string().optional().describe('Link to the original'),
        })).optional().describe('Key updates, announcements, status changes — FYI items'),
        channelSummaries: z.array(z.object({
          name: z.string().describe('Channel name'),
          messageCount: z.number().optional().describe('Number of messages'),
          summary: z.string().describe('Brief summary of activity in this channel'),
        })).optional().describe('Per-channel activity summaries'),
      })),
      execute: async (data) => {
        // Ingest report data into the knowledge graph (fire-and-forget, non-blocking)
        void (async () => {
          try {
            const nodes: GraphPayload['nodes'] = [];
            const edges: GraphPayload['edges'] = [];
            const now = new Date().toISOString();

            const items = [
              ...(data.actionItems || []).map((item: any) => ({ ...item, category: 'action_item' })),
              ...(data.updates || []).map((item: any) => ({ ...item, category: 'update' })),
            ];

            for (const item of items) {
              const source = (item.source || 'unknown').toLowerCase();
              const externalId = item.permalink || `${source}:${item.title.toLowerCase().replace(/\s+/g, '-').slice(0, 80)}`;
              const nodeType = source === 'jira' ? 'Ticket'
                : source === 'github' ? 'GitHubEvent'
                : 'Message';

              nodes.push({
                type: nodeType,
                external_id: externalId,
                properties: {
                  title: item.title,
                  description: item.description,
                  source,
                  category: item.category,
                  permalink: item.permalink || null,
                  last_seen: now,
                },
              });
            }

            for (const ch of data.channelSummaries || []) {
              nodes.push({
                type: 'Channel',
                external_id: `slack:channel:${ch.name.toLowerCase()}`,
                properties: {
                  name: ch.name,
                  summary: ch.summary,
                  message_count: ch.messageCount || null,
                  last_seen: now,
                },
              });
            }

            if (nodes.length > 0) {
              await graphService.upsertGraph({ nodes, edges, userId });
              console.log(`[graph] Ingested ${nodes.length} nodes from report "${data.title}"`);
            }

            // Save the report to the reports table
            const { error: reportError } = await supabase.from('reports').insert({
              user_id: userId,
              title: data.title,
              subtitle: data.subtitle || null,
              report_type: 'custom',
              data,
              generated_at: now,
            });
            if (reportError) {
              console.error('[graph] Failed to save report:', reportError.message);
            } else {
              console.log(`[graph] Saved report "${data.title}" for user ${userId}`);
            }

            // Extract action items as todos
            if (data.actionItems && data.actionItems.length > 0) {
              const todos = data.actionItems.map((item: any) => ({
                user_id: userId,
                title: item.title,
                description: item.description,
                source: item.source || 'unknown',
                source_permalink: item.permalink || null,
                priority: 1,
                status: 'pending',
              }));
              const { error: todoError } = await supabase.from('todos').insert(todos);
              if (todoError) {
                console.error('[graph] Failed to save todos:', todoError.message);
              }
            }
          } catch (err) {
            console.error('[graph] Post-chat ingestion error:', err);
          }
        })();

        // Return immediately for frontend rendering
        return data;
      },
    }),
  };
}
