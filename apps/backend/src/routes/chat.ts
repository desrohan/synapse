import { Router, Request, Response } from 'express';
import { createGoogleGenerativeAI, type GoogleLanguageModelOptions } from '@ai-sdk/google';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import type { UIMessage } from 'ai';
import { createUserTools } from '../llm/tools.js';
import { getMCPToolsForUser } from '../llm/mcpMapper.js';
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
2. If 'searchGraph' returns no matches or is insufficient, you MUST immediately call the live external tools (e.g. 'slack__get_slack_attention_feed' or 'slack__search_slack_messages_global') to get real-time workspace data.
3. NEVER write a text response to the user explaining that you found nothing in the Knowledge Graph.
4. NEVER ask the user which channels, keywords, or types of messages to look for. You are FORBIDDEN from asking clarification questions about search parameters. Figure it out on your own by executing the live aggregate tools immediately.
5. You MUST fetch all live data and perform your tool calls sequence before writing your final reply.

Always structure attention/message feeds semantically into:
1. **Direct mentions requiring action** (items explicitly addressing the user, asking questions, requesting code reviews or work). Format as bullet points with: Sender, Channel, brief summary of request, date, and action required.
2. **FYI / lower priority** (general threads, announcements, or status updates not requiring direct action).

When the user asks you to remember something, ALWAYS use the 'writeMemory' tool to save it into the Knowledge Graph.

Respond concisely and professionally in Markdown. Do not expose internal graph UUIDs to the user, use names and keys.`;

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

router.post('/', async (req: Request, res: Response) => {
  const { messages, userId } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'User ID is required' });
  }

  try {
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
