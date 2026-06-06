import { createClient } from '@supabase/supabase-js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText, stepCountIs } from 'ai';
import { getMCPToolsForUser } from '../llm/mcpMapper.js';
import { createUserTools } from '../llm/tools.js';
import { bootstrapMCPServersForUser } from '../mcp/bootstrap.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Runs scheduled reports for all users whose schedule matches the current time.
 * Should be called every minute by a cron job or Trigger.dev task.
 */
export async function runScheduledReports() {
  const now = new Date();
  const currentTimeUTC = now.toISOString().slice(11, 16); // "HH:MM"
  const currentDayOfWeek = now.getUTCDay(); // 0=Sun

  // Find all schedules that should run right now
  const { data: schedules, error } = await supabase
    .from('user_schedules')
    .select('*')
    .eq('enabled', true)
    .eq('time_utc', currentTimeUTC);

  if (error || !schedules || schedules.length === 0) return;

  for (const schedule of schedules) {
    // Skip weekly schedules if it's not the right day
    if (schedule.schedule_type === 'weekly' && schedule.day_of_week !== currentDayOfWeek) {
      continue;
    }

    // Skip if already run today (prevent double-runs)
    if (schedule.last_run_at) {
      const lastRun = new Date(schedule.last_run_at);
      const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
      if (schedule.schedule_type === 'daily' && hoursSinceLastRun < 20) continue;
      if (schedule.schedule_type === 'weekly' && hoursSinceLastRun < 160) continue;
    }

    try {
      await generateAndDeliverReport(schedule);

      // Mark as run
      await supabase
        .from('user_schedules')
        .update({ last_run_at: now.toISOString() })
        .eq('id', schedule.id);
    } catch (err) {
      console.error(`[scheduler] Failed to run report for user ${schedule.user_id}:`, err);
    }
  }
}

async function generateAndDeliverReport(schedule: any) {
  const { user_id, schedule_type } = schedule;
  const hoursBack = schedule_type === 'weekly' ? 168 : 24;

  // Bootstrap MCP servers for the user before loading tools
  await bootstrapMCPServersForUser(user_id);

  // Get the user's connected tools
  const userTools = createUserTools(user_id);
  const mcpTools = await getMCPToolsForUser(user_id);

  const systemPrompt = `You are Synapse, generating a scheduled ${schedule_type} report.
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

  // Use generateText (non-streaming) to run the full multi-step tool pipeline
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    system: systemPrompt,
    messages: [{ role: 'user', content: `Generate my ${schedule_type} report.` }],
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

  // Extract the generateReport tool call result
  const reportToolCall = result.steps
    .flatMap((s: any) => s.toolCalls)
    .find((tc: any) => tc.toolName === 'generateReport');

  if (!reportToolCall) {
    console.error(`[scheduler] No generateReport call produced for user ${user_id}`);
    return;
  }

  const reportData = (reportToolCall as any).input || (reportToolCall as any).args;

  // Save to reports table
  await supabase.from('reports').insert({
    user_id,
    title: reportData.title || `${schedule_type === 'weekly' ? 'Weekly Recap' : 'Daily Brief'}`,
    subtitle: reportData.subtitle || null,
    report_type: schedule_type,
    data: reportData,
    generated_at: new Date().toISOString(),
  });

  // Extract todos from action items
  if (reportData.actionItems && reportData.actionItems.length > 0) {
    const todos = reportData.actionItems.map((item: any) => ({
      user_id,
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
      .eq('user_id', user_id);

    const existingTitles = new Set(existingTodos?.map((t: any) => t.title.toLowerCase().trim()) || []);
    const uniqueTodos = todos.filter((t: any) => !existingTitles.has(t.title.toLowerCase().trim()));

    if (uniqueTodos.length > 0) {
      await supabase.from('todos').insert(uniqueTodos);
    }
  }

  // Deliver via configured channel
  if (schedule.delivery_channel === 'slack') {
    await deliverViaSlack(user_id, reportData, schedule_type);
  }
}

async function deliverViaSlack(userId: string, reportData: any, type: string) {
  // Get the user's incoming webhook URL
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('metadata')
    .eq('user_id', userId)
    .eq('provider', 'slack')
    .single();

  const webhookUrl = integration?.metadata?.incoming_webhook_url;
  if (!webhookUrl) {
    console.warn(`[scheduler] No Slack incoming webhook for user ${userId}`);
    return;
  }

  // Format report as Slack blocks
  const actionCount = reportData.actionItems?.length || 0;
  const updateCount = reportData.updates?.length || 0;

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: reportData.title || `${type === 'weekly' ? 'Weekly Recap' : 'Daily Brief'}` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: reportData.subtitle || new Date().toLocaleDateString() }],
    },
  ];

  if (actionCount > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*🎯 Action Items (${actionCount})*` },
    });
    for (const item of reportData.actionItems.slice(0, 5)) {
      const link = item.permalink ? ` <${item.permalink}|→>` : '';
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `• *${item.title}*${link}\n  ${item.description}` },
      });
    }
  }

  if (updateCount > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*📋 Updates (${updateCount})*` },
    });
    for (const item of reportData.updates.slice(0, 5)) {
      const link = item.permalink ? ` <${item.permalink}|→>` : '';
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `• *${item.title}*${link}\n  ${item.description}` },
      });
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `_View full report in <${process.env.FRONTEND_URL}/dashboard|Synapse Dashboard>_` }],
  });

  // Post to Slack via incoming webhook
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks }),
  });

  console.log(`[scheduler] Delivered ${type} report to Slack for user ${userId}`);
}
