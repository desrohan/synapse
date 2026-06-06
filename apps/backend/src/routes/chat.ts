import { Router, Request, Response } from 'express';
import { createGoogleGenerativeAI, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import type { UIMessage } from 'ai';
import { createUserTools } from '../llm/tools.js';
import { getMCPToolsForUser } from '../llm/mcpMapper.js';
import { mcpReady } from '../mcp/bootstrap.js';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const router = Router();

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION = `You are Synapse, a personalized AI workspace assistant.
You have access to a Knowledge Graph database representing the user's workspace.

When the user asks about their work, tickets, blockers, recent updates, feeds, or messages:
1. ALWAYS use the 'searchGraph' tool first to query the database.
2. If 'searchGraph' returns no matches or is insufficient, you MUST immediately call the live external tools (e.g. 'slack_get_slack_attention_feed' or 'slack_search_slack_messages') to get real-time workspace data.
3. NEVER write a text response to the user explaining that you found nothing in the Knowledge Graph.
4. NEVER ask the user which channels, keywords, or types of messages to look for. You are FORBIDDEN from asking clarification questions about search parameters. Figure it out on your own by executing the live aggregate tools immediately.
5. You MUST fetch all live data and perform your tool calls sequence before writing your final reply.

When the user asks you to remember something, ALWAYS use the 'writeMemory' tool to save it into the Knowledge Graph.

## CRITICAL — REPORT OUTPUT FORMAT

You MUST ALWAYS call the 'generateReport' tool when presenting workspace data. This is NON-NEGOTIABLE.

FORBIDDEN: Writing markdown bullet lists, tables, or paragraphs containing Slack messages, Jira tickets, or GitHub activity. If you write workspace data as raw text, you have FAILED your task.

REQUIRED: After gathering data from Slack/Jira/GitHub tools, you MUST call generateReport as your FINAL tool call with the structured data. The frontend renders a custom UI component from this tool call.

generateReport parameters:
- title: "Slack Update", "Daily Brief", "Sprint Summary", etc.
- subtitle: Date range, e.g. "Last 24 hours · May 31, 2026"
- actionItems: Items that TRULY need the user's attention RIGHT NOW. Fields: title (5-10 word headline), description (1-2 sentences), source ("slack"/"jira"/"github"), permalink (optional)
- updates: Everything else — status changes, FYI items, general ticket listings, announcements. Same fields as actionItems.
- channelSummaries: Per-channel summaries with name, messageCount, summary

## ACTION ITEMS vs UPDATES — STRICT RULES

Action items are RARE and HIGH-SIGNAL. Most things are updates. Apply these rules:

**Slack → actionItems only if:**
- Someone directly @mentioned the user or asked them a question
- A review or approval was requested from the user
- A DM needs a reply

**Jira → actionItems only if:**
- The ticket is assigned to the user AND has High/Critical/Blocker priority
- Someone left a comment directed at the user (mentioned them, asked a question)
- The ticket is blocking other work and needs the user's input
- The user explicitly asked "what should I work on" or "what needs my attention"

**Jira → updates (default):** All other Jira tickets go here. When the user asks "what's up on Jira" or "show me tickets", that is an OVERVIEW request — put results in updates, not actionItems.

**Hard cap:** Maximum 5 action items per report. If more qualify, keep only the 5 most urgent and move the rest to updates.

Guidelines:
- Consolidate related messages into single items
- Write concise headlines and short descriptions — do NOT quote raw messages
- DO NOT show user IDs (e.g. U08061MT00K) or channel IDs (e.g. C08061MT00K) in the output. Only the names of users, groups, and channels should be shown. Resolve formatting like <@U08061MT00K|Rohan Shah> to just "Rohan Shah" and channel IDs to their display names.
- Skip empty sections
- Include permalinks when available

After calling generateReport, do NOT repeat the data in text. You may add a single brief sentence if needed.

For non-report responses (general questions, memory, conversation), respond naturally in concise markdown.
Do not expose internal graph UUIDs to the user, use names and keys.`;

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

router.post('/', async (req: Request, res: Response) => {
  const { messages, userId, threadId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'User ID is required' });
  }

  // Auto-set thread title from first user message
  if (threadId) {
    try {
      const { data: thread } = await supabase
        .from('chat_threads')
        .select('title')
        .eq('id', threadId)
        .maybeSingle();

      if (thread && (thread.title === 'New Chat' || !thread.title)) {
        const firstUserMsg = messages.find((m: any) => m.role === 'user');
        if (firstUserMsg) {
          let title = 'New Chat';
          if (typeof firstUserMsg.content === 'string') {
            title = firstUserMsg.content.substring(0, 100);
          } else if (Array.isArray(firstUserMsg.content)) {
            const textPart = firstUserMsg.content.find((p: any) => p.type === 'text');
            if (textPart?.text) title = textPart.text.substring(0, 100);
          }
          if (title !== 'New Chat') {
            await supabase
              .from('chat_threads')
              .update({ title, updated_at: new Date().toISOString() })
              .eq('id', threadId);
          }
        }
      }
    } catch (err) {
      console.error('Auto-title error (non-fatal):', err);
    }
  }

  try {
    // Wait for MCP servers to finish connecting before resolving tools
    await mcpReady;

    const userTools = createUserTools(userId);
    const mcpTools = await getMCPToolsForUser(userId);

    // Fetch Slack metadata to inject Slack User ID into instructions
    const { data: slackIntegration } = await supabase
      .from('user_integrations')
      .select('metadata, access_token')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .maybeSingle();

    let slackInfo = "";
    if (slackIntegration) {
      let slackUserId = slackIntegration.metadata?.slack_user_id;
      let slackUsername = slackIntegration.metadata?.slack_username;

      // Lazy check: if slack_user_id is not stored, resolve it and save it
      if (!slackUserId && slackIntegration.access_token) {
        try {
          const authTestResp = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${slackIntegration.access_token}` }
          });
          const authTestData = await authTestResp.json();
          if (authTestData.ok) {
            slackUserId = authTestData.user_id;
            slackUsername = authTestData.user;
            
            // Save back to metadata JSON
            await supabase.from('user_integrations').update({
              metadata: { 
                ...slackIntegration.metadata, 
                slack_user_id: slackUserId,
                slack_username: slackUsername
              }
            }).eq('user_id', userId).eq('provider', 'slack');
          }
        } catch (err) {
          console.error("Failed to dynamically fetch slack user details during chat:", err);
        }
      }

      if (slackUserId) {
        slackInfo = `\nYour connected Slack user ID is '${slackUserId}' and username is '${slackUsername || 'User'}'. Use this ID/name when filtering or searching Slack messages for your mentions.`;
      }
    }

    const result = streamText({
      model: google('gemini-2.5-flash'),
      system: SYSTEM_INSTRUCTION + slackInfo,
      messages: await convertToModelMessages(messages as UIMessage[]),
      tools: {
        ...userTools,
        ...mcpTools,
      },
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingBudget: 4096,
            includeThoughts: true,
          },
        } satisfies GoogleLanguageModelOptions,
      },
      stopWhen: stepCountIs(10),
    });

    const webResponse = result.toUIMessageStreamResponse();

    // Pipe the web Response to Express
    res.status(200);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        res.end();
      }
    } else {
      res.end();
    }
  } catch (error: any) {
    console.error('Chat Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal error' });
    } else {
      res.end();
    }
  }
});

export default router;
