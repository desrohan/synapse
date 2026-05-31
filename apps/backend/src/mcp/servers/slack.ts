import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const accessToken = process.env.SLACK_BOT_TOKEN;
const teamId = process.env.SLACK_TEAM_ID;

if (!accessToken) {
  console.error("SLACK_BOT_TOKEN is required");
  process.exit(1);
}

const server = new Server({
  name: 'synapse-slack-server',
  version: '1.0.0',
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_slack_attention_feed',
      description: 'Get a consolidated feed of Slack messages requiring the user\'s attention (e.g. direct mentions, unread DMs, recent thread replies). Use this as a starting point for general attention or message feed queries.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max number of items to scan or return per category (default: 10)' }
        }
      }
    },
    {
      name: 'search_slack_messages_global',
      description: 'Search Slack messages globally across all channels the user is in using Slack\'s advanced search queries (e.g. "mentions:me", "from:userName").',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query (e.g., "mentions:me", "has:link")' },
          count: { type: 'number', description: 'Number of results to return (default: 20)' }
        },
        required: ['query']
      }
    },
    {
      name: 'slack_get_channels',
      description: 'List public or private channels in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          types: { type: 'string', description: 'Comma-separated list of types (e.g. "public_channel,private_channel", default: "public_channel")' },
          limit: { type: 'number', description: 'Max number of channels to return (default: 100)' }
        }
      }
    },
    {
      name: 'slack_get_channel_history',
      description: 'Retrieve history of messages from a specific channel.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'The channel ID (e.g. C12345)' },
          limit: { type: 'number', description: 'Number of messages to retrieve (default: 50)' },
          oldest: { type: 'string', description: 'Filter messages oldest timestamp' },
          latest: { type: 'string', description: 'Filter messages latest timestamp' }
        },
        required: ['channel']
      }
    },
    {
      name: 'slack_post_message',
      description: 'Post a new message to a channel.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'The channel ID or name (e.g. C12345 or #general)' },
          text: { type: 'string', description: 'The text content of the message' },
          thread_ts: { type: 'string', description: 'The parent message timestamp if replying to a thread' }
        },
        required: ['channel', 'text']
      }
    },
    {
      name: 'slack_reply_to_thread',
      description: 'Reply to an existing thread in a channel.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'The channel ID' },
          text: { type: 'string', description: 'The reply text' },
          thread_ts: { type: 'string', description: 'The parent message timestamp' }
        },
        required: ['channel', 'text', 'thread_ts']
      }
    }
  ]
}));

async function callSlackApi(endpoint: string, method: string = 'GET', body: any = null) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json'
  };

  let url = `https://slack.com/api/${endpoint}`;
  let options: RequestInit = { method, headers };

  if (body) {
    if (method === 'GET') {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) {
          params.append(k, String(v));
        }
      }
      url = `${url}?${params.toString()}`;
    } else {
      headers['Content-Type'] = 'application/json; charset=utf-8';
      options.body = JSON.stringify(body);
    }
  }

  const resp = await fetch(url, options);
  if (!resp.ok) {
    throw new Error(`Slack API HTTP error ${resp.status}: ${await resp.text()}`);
  }
  const data = await resp.json();
  if (!data.ok) {
    throw new Error(`Slack API error in ${endpoint}: ${data.error}`);
  }
  return data;
}

async function executeTool(request: any) {
  const { name, arguments: args } = request.params;

  if (name === 'get_slack_attention_feed') {
    const limit = (args?.limit as number) || 10;
    
    // 1. Resolve current user ID and metadata
    const authTest = await callSlackApi('auth.test', 'POST');
    const myUserId = authTest.user_id;
    const myUsername = authTest.user;

    // 2. Query global mentions using search.messages API
    let mentions: any[] = [];
    try {
      const searchResult = await callSlackApi('search.messages', 'GET', {
        query: `to:me OR mentions:me OR cc:me OR "${myUsername}" OR <@${myUserId}>`,
        count: limit
      });
      const matches = searchResult.messages?.matches || [];
      mentions = matches.map((m: any) => ({
        channelId: m.channel?.id,
        channelName: m.channel?.name,
        sender: m.username || m.user,
        text: m.text,
        timestamp: m.ts,
        permalink: m.permalink
      }));
    } catch (err: any) {
      console.error("Failed to query slack mentions:", err.message);
    }

    // 3. Scan active DMs / group DMs
    const dmFeed: any[] = [];
    try {
      const dmResult = await callSlackApi('conversations.list', 'GET', {
        types: 'im,mpim',
        exclude_archived: true,
        limit: 10
      });
      const dmChannels = dmResult.channels || [];

      for (const dm of dmChannels.slice(0, 6)) {
        try {
          const history = await callSlackApi('conversations.history', 'GET', {
            channel: dm.id,
            limit: 5
          });
          const messages = history.messages || [];
          
          // Get recent messages not sent by the current user
          const incomingMessages = messages.filter((msg: any) => msg.user !== myUserId);
          if (incomingMessages.length > 0) {
            dmFeed.push({
              channelId: dm.id,
              isGroup: !!dm.is_mpim,
              recentMessages: incomingMessages.map((msg: any) => ({
                sender: msg.user,
                text: msg.text,
                timestamp: msg.ts
              }))
            });
          }
        } catch (historyErr) {
          // Ignore failure on specific private histories
        }
      }
    } catch (dmErr: any) {
      console.error("Failed to scan DMs:", dmErr.message);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          userId: myUserId,
          username: myUsername,
          mentions,
          directMessages: dmFeed,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  }

  if (name === 'search_slack_messages_global') {
    const query = args?.query as string;
    const count = (args?.count as number) || 20;
    
    const searchResult = await callSlackApi('search.messages', 'GET', { query, count });
    const matches = searchResult.messages?.matches || [];
    const parsedMatches = matches.map((m: any) => ({
      channelId: m.channel?.id,
      channelName: m.channel?.name,
      sender: m.username || m.user,
      text: m.text,
      timestamp: m.ts,
      permalink: m.permalink
    }));

    return { content: [{ type: 'text', text: JSON.stringify(parsedMatches, null, 2) }] };
  }

  if (name === 'slack_get_channels') {
    const types = (args?.types as string) || 'public_channel';
    const limit = (args?.limit as number) || 100;
    const data = await callSlackApi('conversations.list', 'GET', { types, limit, exclude_archived: true });
    return { content: [{ type: 'text', text: JSON.stringify(data.channels || [], null, 2) }] };
  }

  if (name === 'slack_get_channel_history') {
    const channel = args?.channel as string;
    const limit = (args?.limit as number) || 50;
    const oldest = args?.oldest as string;
    const latest = args?.latest as string;
    
    const data = await callSlackApi('conversations.history', 'GET', { channel, limit, oldest, latest });
    return { content: [{ type: 'text', text: JSON.stringify(data.messages || [], null, 2) }] };
  }

  if (name === 'slack_post_message') {
    const channel = args?.channel as string;
    const text = args?.text as string;
    const thread_ts = args?.thread_ts as string;
    
    const data = await callSlackApi('chat.postMessage', 'POST', { channel, text, thread_ts });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  if (name === 'slack_reply_to_thread') {
    const channel = args?.channel as string;
    const text = args?.text as string;
    const thread_ts = args?.thread_ts as string;
    
    const data = await callSlackApi('chat.postMessage', 'POST', { channel, text, thread_ts });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await executeTool(request);
  } catch (error: any) {
    return { content: [{ type: 'text', text: `Slack API Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Slack Custom MCP Server running on stdio');
}

main().catch(console.error);
