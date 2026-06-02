import { schedules, logger } from "@trigger.dev/sdk";
import { createClient } from '@supabase/supabase-js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { getMCPToolsForUser } from '../llm/mcpMapper.js';
import { createUserTools } from '../llm/tools.js';
import dotenv from 'dotenv';

dotenv.config();

export const generateScheduledReport = schedules.task({
  id: "generate-scheduled-report",
  run: async (payload, { ctx }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || ''
    );

    const google = createGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    if (!payload.externalId) {
      logger.error("No externalId provided in schedule payload");
      return { success: false, error: "No externalId provided" };
    }

    const [userId, scheduleType] = payload.externalId.split('-');
    if (!userId || !scheduleType || (scheduleType !== 'daily' && scheduleType !== 'weekly')) {
      logger.error("Invalid externalId format", { externalId: payload.externalId });
      return { success: false, error: "Invalid externalId format" };
    }

    logger.info("Starting scheduled report generation", { 
      userId, 
      scheduleType 
    });

    try {
      // Get the user's schedule configuration
      const { data: schedule, error: scheduleError } = await supabase
        .from('user_schedules')
        .select('*')
        .eq('user_id', userId)
        .eq('schedule_type', scheduleType)
        .single();

      if (scheduleError || !schedule) {
        logger.error("Schedule not found", { userId, scheduleType });
        return { success: false, error: "Schedule not found" };
      }

      // Calculate time range for data collection
      const hoursBack = scheduleType === 'weekly' ? 168 : 24; // 7 days or 1 day
      const systemPrompt = `You are Synapse, generating a scheduled ${scheduleType} report.
Gather workspace data from the last ${hoursBack} hours using the available tools.
Then call the generateReport tool with the structured data.
Title it "${scheduleType === 'weekly' ? 'Weekly Recap' : 'Daily Brief'}".
Include action items, updates, and channel summaries as appropriate.
Be thorough but concise.`;

      // Get the user's connected tools
      const userTools = createUserTools(userId);
      const mcpTools = await getMCPToolsForUser(userId);

      // Use generateText to run the full multi-step tool pipeline
      const result = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: [{ role: 'user', content: `Generate my ${scheduleType} report.` }],
        tools: { ...userTools, ...mcpTools },
        maxSteps: 10,
      } as any);

      // Extract the generateReport tool call result
      const reportToolCall = result.steps
        .flatMap((s: any) => s.toolCalls)
        .find((tc: any) => tc.toolName === 'generateReport');

      if (!reportToolCall) {
        logger.error("No generateReport call produced");
        return { success: false, error: "Report generation failed" };
      }

      const reportData = (reportToolCall as any).args;

      // Save to reports table
      const { data: savedReport, error: saveError } = await supabase
        .from('reports')
        .insert({
          user_id: userId,
          title: reportData.title || `${scheduleType === 'weekly' ? 'Weekly Recap' : 'Daily Brief'}`,
          subtitle: reportData.subtitle || null,
          report_type: scheduleType,
          data: reportData,
          generated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (saveError) {
        logger.error("Failed to save report", { error: saveError.message });
        return { success: false, error: saveError.message };
      }

      // Extract todos from action items
      if (reportData.actionItems && reportData.actionItems.length > 0) {
        const todos = reportData.actionItems.map((item: any) => ({
          user_id: userId,
          title: item.title,
          description: item.description,
          source: item.source || 'unknown',
          source_permalink: item.permalink || null,
          priority: 1, // action items get higher priority
          status: 'pending',
        }));

        const { error: todoError } = await supabase
          .from('todos')
          .upsert(todos, {
            onConflict: 'user_id, title',
            ignoreDuplicates: true,
          });

        if (todoError) {
          logger.error("Failed to save todos", { error: todoError.message });
        }
      }

      // Mark schedule as run
      await supabase
        .from('user_schedules')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', schedule.id);

      logger.info("Scheduled report generated successfully", { 
        userId, 
        reportId: savedReport?.id 
      });

      return { 
        success: true, 
        reportId: savedReport?.id,
        actionItems: reportData.actionItems?.length || 0,
        updates: reportData.updates?.length || 0 
      };

    } catch (error) {
      logger.error("Scheduled report generation failed", { error: error instanceof Error ? error.message : error });
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  },
});