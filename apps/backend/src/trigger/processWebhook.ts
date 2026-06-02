import { task, logger } from "@trigger.dev/sdk";
import { contextProcessor } from '../llm/gemini.js';
import { graphService } from '../db/graph.js';

export const processWebhookTask = task({
  id: "process-webhook-task",
  run: async (payload: { source: string; event_type: string; payload: any; userId?: string }) => {
    logger.info("Processing webhook event in background", {
      source: payload.source,
      event_type: payload.event_type,
      userId: payload.userId
    });

    const { source, event_type, payload: eventPayload, userId } = payload;

    // Return early if no payload
    if (!eventPayload) {
      logger.warn("Webhook processing skipped: no payload");
      return { status: 'skipped', reason: 'no payload' };
    }

    try {
      // Process with Gemini LLM pipeline for entity extraction
      const graphData = await contextProcessor.extractEntities(source, eventPayload);

      // Add user_id to graph data if available
      if (userId) {
        graphData.userId = userId;
      }

      // Upsert into Supabase Graph
      await graphService.upsertGraph(graphData);

      logger.info(`Successfully processed ${source} webhook: ${event_type}`, {
        nodes: graphData.nodes?.length || 0,
        edges: graphData.edges?.length || 0
      });

      return {
        status: 'success',
        processed: true,
        nodes: graphData.nodes?.length || 0,
        edges: graphData.edges?.length || 0
      };
    } catch (error) {
      logger.error(`Failed to process ${source} webhook:`, {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  },
});
