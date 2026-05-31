import { createClient } from '@supabase/supabase-js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import { getMCPToolsForUser } from '../llm/mcpMapper.js';
import { createUserTools } from '../llm/tools.js';
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

  // Get the user's connected tools
  const userTools = createUserTools(user_id);
  const mcpTools = await getMCPToolsForUser(user_id);

  const systemPrompt = `You are Synapse, generating a scheduled ${schedule_type} report.
Gather workspace data from the last ${hoursBack} hours using the available tools.
Then call the generateReport tool with the structured data.
Title it "${schedule_type === 'weekly' ? 'Weekly Recap' : 'Daily Brief'}".
Include action items, updates, and channel summaries as appropriate.
Be thorough but concise.`;

  // Use generateText (non-streaming) to run the full multi-step tool pipeline
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    system: systemPrompt,
    messages: [{ role: 'user', content: `Generate my ${schedule_type} report.` }],
    tools: { ...userTools, ...mcpTools },
    maxSteps: 10,
  } as any);

  // Extract the generateReport tool call result
  const reportToolCall = result.steps
    .flatMap((s: any) => s.toolCalls)
    .find((tc: any) => tc.toolName === 'generateReport');

  if (!reportToolCall) {
    console.error(`[scheduler] No generateReport call produced for user ${user_id}`);
    return;
  }

  const reportData = (reportToolCall as any).args;

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

    await supabase.from('todos').upsert(todos, {
      onConflict: 'user_id, title',
      ignoreDuplicates: true,
    });
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
