import { schedules, logger } from "@trigger.dev/sdk";
import { createClient } from '@supabase/supabase-js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, stepCountIs } from 'ai';
import { getMCPToolsForUser } from '../llm/mcpMapper.js';
import { createUserTools } from '../llm/tools.js';
import { bootstrapMCPServersForUser } from '../mcp/bootstrap.js';
import { mcpManager } from '../mcp/index.js';
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

    const lastDashIndex = payload.externalId.lastIndexOf('-');
    if (lastDashIndex === -1) {
      logger.error("Invalid externalId format", { externalId: payload.externalId });
      return { success: false, error: "Invalid externalId format" };
    }
    const userId = payload.externalId.slice(0, lastDashIndex);
    const scheduleType = payload.externalId.slice(lastDashIndex + 1);

    if (!userId || !scheduleType || (scheduleType !== 'daily' && scheduleType !== 'weekly')) {
      logger.error("Invalid externalId format", { externalId: payload.externalId });
      return { success: false, error: "Invalid externalId format" };
    }

    logger.info("Starting scheduled report generation", { 
      userId, 
      scheduleType 
    });

    try {
      // Bootstrap MCP servers for the user before loading tools
      await bootstrapMCPServersForUser(userId);

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
You MUST strictly follow this execution plan:
1. Fetch Slack messages from the last ${hoursBack} hours by calling 'slack_get_slack_attention_feed' (using hours: ${hoursBack}).
2. Fetch Jira issues by calling 'jira_search_issues' with JQL for the user's assigned issues (e.g., "assignee = currentUser()").
3. (Optional) Query 'searchGraph' to supplement the report with stored memory.
4. Finally, call the 'generateReport' tool with the structured data compiled from the actual outputs of your Slack/Jira tool calls.

CRITICAL RULES:
- You MUST execute the data gathering tools ('slack_get_slack_attention_feed', 'jira_search_issues', 'searchGraph') first. 
- You are FORBIDDEN from calling 'generateReport' in the same step/in parallel with the data gathering tools. You MUST only call 'generateReport' in a subsequent step after you have received the data from Slack and Jira.
- You MUST ALWAYS call the 'generateReport' tool to present the report data. You are FORBIDDEN from writing markdown bullet lists, tables, or paragraphs containing Slack messages or Jira issues as raw text. If you write workspace data as raw text, you have FAILED your task.
- You are strictly forbidden from fabricating placeholder or mock report data. If the tools return no messages or issues, leave the sections empty, but you must actually call the tools first to verify this.
- DO NOT show user IDs (e.g. U08061MT00K) or channel IDs (e.g. C08061MT00K) in the generated report output (titles, descriptions, summaries, etc.). Only the names of users, groups, and channels should be shown. Resolve formatting like <@U08061MT00K|Rohan Shah> to just "Rohan Shah" and channel IDs to their display names.
- DO NOT write any code, scripts, programs, or regular expressions (such as Python blocks) to process or clean the data. All text cleaning, ID resolving, and formatting must be done internally in your reasoning, and the final cleaned text must be passed directly as arguments to the 'generateReport' tool call.`;

      // Get the user's connected tools
      const userTools = createUserTools(userId);
      const mcpTools = await getMCPToolsForUser(userId);

      // Use generateText to run the full multi-step tool pipeline
      const result = await generateText({
        model: google('gemini-2.5-flash'),
        system: systemPrompt,
        messages: [{ role: 'user', content: `Generate my ${scheduleType} report.` }],
        tools: { ...userTools, ...mcpTools },
        stopWhen: stepCountIs(10),
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingBudget: 4096,
            },
          },
        },
      } as any);

      logger.info("DEBUG: Tool execution steps", {
        steps: result.steps?.map((s: any, idx: number) => ({
          step: idx + 1,
          toolCalls: s.toolCalls?.map((tc: any) => ({
            name: tc.toolName,
            args: tc.args || tc.input
          })),
          toolResults: s.toolResults?.map((tr: any) => ({
            name: tr.toolName,
            output: typeof tr.output === 'object' 
              ? (JSON.stringify(tr.output).length > 500 ? JSON.stringify(tr.output).substring(0, 500) + "... [truncated]" : tr.output)
              : (typeof tr.output === 'string' && tr.output.length > 500 ? tr.output.substring(0, 500) + "... [truncated]" : tr.output)
          })),
          text: s.text
        }))
      });

      // Extract the generateReport tool call result
      const reportToolCall = result.steps
        .flatMap((s: any) => s.toolCalls)
        .find((tc: any) => tc.toolName === 'generateReport');

      if (!reportToolCall) {
        logger.error("No generateReport call produced");
        return { success: false, error: "Report generation failed" };
      }

      const reportData = (reportToolCall as any).input || (reportToolCall as any).args;

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

        // Filter out duplicates in memory to avoid DB constraint issues
        const { data: existingTodos } = await supabase
          .from('todos')
          .select('title')
          .eq('user_id', userId);

        const existingTitles = new Set(existingTodos?.map((t: any) => t.title.toLowerCase().trim()) || []);
        const uniqueTodos = todos.filter((t: any) => !existingTitles.has(t.title.toLowerCase().trim()));

        if (uniqueTodos.length > 0) {
          const { error: todoError } = await supabase
            .from('todos')
            .insert(uniqueTodos);

          if (todoError) {
            logger.error("Failed to save todos", { error: todoError.message });
          }
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

    } catch (error: any) {
      logger.error("Scheduled report generation failed", { 
        errorMessage: error?.message,
        errorStack: error?.stack,
        errorDetails: JSON.stringify(error),
        failedGeneration: error?.failedGeneration || error?.failed_generation
      });
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        failedGeneration: error?.failedGeneration || error?.failed_generation || null
      };
    } finally {
      // Disconnect user's MCP clients to prevent Trigger.dev worker from hanging
      const userClients = mcpManager.getAllClientNames().filter(name => name.endsWith(userId));
      for (const clientName of userClients) {
        try {
          await mcpManager.disconnectServer(clientName);
        } catch (err) {
          // ignore
        }
      }
    }
  },
});