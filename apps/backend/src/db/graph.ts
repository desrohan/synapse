import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseClient: any = null;
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment');
    }
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

export interface GraphNode {
  type: string;
  external_id: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  source_external_id: string;
  target_external_id: string;
  relation_type: string;
  properties?: Record<string, any>;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  userId?: string;
}

export class GraphService {
  async upsertGraph(payload: GraphPayload) {
    if (!payload.nodes || payload.nodes.length === 0) return;
    if (!payload.userId) throw new Error('userId is required for graph operations');

    const { userId } = payload;

    // 1. Upsert all nodes
    const { error: nodeError } = await getSupabase()
      .from('graph_nodes')
      .upsert(
        payload.nodes.map(node => ({
          user_id: userId,
          type: node.type,
          external_id: node.external_id,
          properties: node.properties || {},
          updated_at: new Date().toISOString()
        })),
        { onConflict: 'user_id,type,external_id' }
      );

    if (nodeError) {
      console.error('Error upserting nodes:', nodeError);
      throw new Error(`Failed to upsert nodes: ${nodeError.message}`);
    }

    if (!payload.edges || payload.edges.length === 0) return;

    // 2. Fetch the UUIDs of the nodes we just touched (to map edges)
    const externalIds = payload.nodes.map(n => n.external_id);
    const { data: dbNodes, error: fetchError } = await getSupabase()
      .from('graph_nodes')
      .select('id, type, external_id')
      .eq('user_id', userId)
      .in('external_id', externalIds);

    if (fetchError || !dbNodes) {
      console.error('Error fetching node UUIDs:', fetchError);
      throw new Error('Failed to resolve node UUIDs for edges');
    }

    const uuidMap = new Map<string, string>();
    dbNodes.forEach((n: any) => uuidMap.set(n.external_id, n.id));

    // 3. Prepare edges with real UUIDs
    const dbEdges = payload.edges.map(edge => {
      const sourceId = uuidMap.get(edge.source_external_id);
      const targetId = uuidMap.get(edge.target_external_id);

      if (!sourceId || !targetId) {
        console.warn(`Skipping edge ${edge.relation_type} because source or target UUID could not be resolved.`);
        return null;
      }

      return {
        user_id: userId,
        source_node_id: sourceId,
        target_node_id: targetId,
        relation_type: edge.relation_type,
        properties: edge.properties || {},
        updated_at: new Date().toISOString()
      };
    }).filter(Boolean);

    if (dbEdges.length === 0) return;

    // 4. Upsert all edges
    const { error: edgeError } = await getSupabase()
      .from('graph_edges')
      .upsert(dbEdges as any[], { onConflict: 'source_node_id,target_node_id,relation_type' });

    if (edgeError) {
      console.error('Error upserting edges:', edgeError);
      throw new Error(`Failed to upsert edges: ${edgeError.message}`);
    }
  }
}

export const graphService = new GraphService();
