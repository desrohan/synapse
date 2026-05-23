import { logger, task } from "@trigger.dev/sdk/v3";
import { contextProcessor } from '../llm/gemini.js';

export const dailySummaryTask = task({
  id: "daily-summary-task",
  run: async (payload: { userId: string }, { ctx }) => {
    logger.info("Generating daily summary for user", { userId: payload.userId });

    // Fetch memory/events for the past 24 hours from the database here
    const recentContext = "Some mock context of 3 merged PRs and 2 Jira blockers.";

    const summary = await contextProcessor.generateSummary(recentContext);

    logger.info("Summary generated", { summary });

    // Notify user here (e.g. via slack or email)
    
    return {
      success: true,
      summary
    };
  },
});
