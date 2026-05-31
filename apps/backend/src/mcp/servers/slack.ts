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
      description: 'Get a summary of what\'s happening on Slack: recent mentions, and recent messages across all channels and DMs within a time window. Shows ALL recent activity, not just unread. Use this when the user asks "anything new on Slack?", "what\'s happening?", or "what did I miss?".',
      inputSchema: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'How many hours back to look (default: 24)' }
        }
      }
    },
    {
      name: 'get_unread_channels_summary',
      description: 'Get a summary of all channels with unread messages and their unread counts. Use this to find out where new activity is.',
      inputSchema: {
        type: 'object',
        properties: {
          types: { type: 'string', description: 'Channel types: "public_channel,private_channel,mpim,im" (default: all)' }
        }
      }
    },
    {
      name: 'get_channel_new_messages',
      description: 'Get only NEW (unread) messages from a specific channel since the user last read it. Much more useful than raw history.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'The channel ID' },
          limit: { type: 'number', description: 'Max messages to return (default: 30)' }
        },
        required: ['channel']
      }
    },
    {
      name: 'search_slack_messages',
      description: 'Search Slack messages globally. Supports Slack search syntax like "from:@user", "in:#channel", "has:link", "before:2025-01-01", "after:2025-01-01", "during:today".',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
          sort: { type: 'string', description: '"timestamp" (newest first) or "score" (most relevant). Default: timestamp' },
          count: { type: 'number', description: 'Number of results (default: 20)' }
        },
        required: ['query']
      }
    },
    {
      name: 'slack_get_channels',
      description: 'List channels in the workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          types: { type: 'string', description: 'Comma-separated types (e.g. "public_channel,private_channel", default: "public_channel")' },
          limit: { type: 'number', description: 'Max channels to return (default: 100)' }
        }
      }
    },
    {
      name: 'slack_get_channel_history',
      description: 'Retrieve message history from a specific channel. Use get_channel_new_messages instead if you only want unread messages.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'The channel ID' },
          limit: { type: 'number', description: 'Number of messages (default: 50)' },
          oldest: { type: 'string', description: 'Unix timestamp - only messages after this' },
          latest: { type: 'string', description: 'Unix timestamp - only messages before this' }
        },
        required: ['channel']
      }
    },
    {
      name: 'slack_get_user_info',
      description: 'Get profile info for a Slack user by their user ID. Use this to resolve user IDs to names.',
      inputSchema: {
        type: 'object',
        properties: {
          user: { type: 'string', description: 'The user ID (e.g. U12345)' }
        },
        required: ['user']
      }
    },
    {
      name: 'slack_post_message',
      description: 'Post a new message to a channel.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'The channel ID or name' },
          text: { type: 'string', description: 'The message text' },
          thread_ts: { type: 'string', description: 'Parent message timestamp if replying to a thread' }
        },
        required: ['channel', 'text']
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

// Cache user names to avoid repeated API calls
const userNameCache: Map<string, string> = new Map();

async function resolveUserName(userId: string): Promise<string> {
  if (userNameCache.has(userId)) return userNameCache.get(userId)!;
  try {
    const data = await callSlackApi('users.info', 'GET', { user: userId });
    const name = data.user?.real_name || data.user?.name || userId;
    userNameCache.set(userId, name);
    return name;
  } catch {
    return userId;
  }
}

async function resolveUserNames(messages: any[]): Promise<any[]> {
  const userIds = [...new Set(messages.map(m => m.user).filter(Boolean))];
  await Promise.all(userIds.map(id => resolveUserName(id)));
  return messages.map(m => ({
    ...m,
    sender_name: m.user ? userNameCache.get(m.user) || m.user : m.username || 'unknown'
  }));
}

async function executeTool(request: any) {
  const { name, arguments: args } = request.params;

  if (name === 'get_slack_attention_feed') {
    const hours = (args?.hours as number) || 24;
    const oldestTs = String(Math.floor(Date.now() / 1000) - hours * 3600);
    const afterDate = new Date(Date.now() - hours * 3600000).toISOString().split('T')[0];
    
    // 1. Identify current user
    const authTest = await callSlackApi('auth.test', 'POST');
    const myUserId = authTest.user_id;

    // 2. Find recent mentions
    let mentions: any[] = [];
    try {
      const searchResult = await callSlackApi('search.messages', 'GET', {
        query: `<@${myUserId}> after:${afterDate}`,
        sort: 'timestamp',
        sort_dir: 'desc',
        count: 20
      });
      const matches = searchResult.messages?.matches || [];
      for (const m of matches) {
        const senderName = await resolveUserName(m.user || m.username);
        mentions.push({
          channel: m.channel?.name || m.channel?.id,
          channelId: m.channel?.id,
          sender: senderName,
          text: m.text,
          date: new Date(parseFloat(m.ts) * 1000).toISOString(),
          permalink: m.permalink
        });
      }
    } catch (err: any) {
      console.error("Failed to search mentions:", err.message);
    }

    // 3. Get recent activity from ALL channels (not just unread)
    const channelActivity: any[] = [];
    try {
      for (const types of ['public_channel,private_channel', 'im,mpim']) {
        const listResult = await callSlackApi('users.conversations', 'GET', {
          types,
          exclude_archived: true,
          limit: 50
        });
        const channels = listResult.channels || [];
        
        for (const ch of channels) {
          try {
            const history = await callSlackApi('conversations.history', 'GET', {
              channel: ch.id,
              oldest: oldestTs,
              limit: 8
            });
            const messages = (history.messages || []).filter((m: any) => !m.subtype || m.subtype === 'bot_message');
            
            if (messages.length > 0) {
              const resolvedMessages = await resolveUserNames(messages);
              let displayName = ch.name || ch.id;
              if (ch.is_im && ch.user) {
                displayName = `DM: ${await resolveUserName(ch.user)}`;
              }
              
              channelActivity.push({
                channel: displayName,
                channelId: ch.id,
                type: ch.is_im ? 'dm' : ch.is_mpim ? 'group_dm' : ch.is_private ? 'private' : 'public',
                messageCount: messages.length,
                hasMore: history.has_more || false,
                recentMessages: resolvedMessages.slice(0, 5).map((m: any) => ({
                  sender: m.sender_name,
                  text: m.text?.substring(0, 300),
                  date: new Date(parseFloat(m.ts) * 1000).toISOString()
                }))
              });
            }
          } catch {
            // Skip channels we can't access
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to scan channels:", err.message);
    }

    // Sort by most recent activity
    channelActivity.sort((a, b) => {
      const aDate = a.recentMessages[0]?.date || '';
      const bDate = b.recentMessages[0]?.date || '';
      return bDate.localeCompare(aDate);
    });

    const summary = {
      lookbackHours: hours,
      mentionsCount: mentions.length,
      activeChannelsCount: channelActivity.length,
      mentions,
      channelActivity,
      generatedAt: new Date().toISOString()
    };

    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  }

  if (name === 'get_unread_channels_summary') {
    const types = (args?.types as string) || 'public_channel,private_channel,mpim,im';
    const authTest = await callSlackApi('auth.test', 'POST');
    const myUserId = authTest.user_id;
    
    const listResult = await callSlackApi('users.conversations', 'GET', {
      types,
      exclude_archived: true,
      limit: 200
    });
    const channels = listResult.channels || [];
    
    const unreadSummary: any[] = [];
    for (const ch of channels) {
      try {
        const info = await callSlackApi('conversations.info', 'GET', { channel: ch.id });
        const channel = info.channel;
        const unreadCount = channel?.unread_count_display || channel?.unread_count || 0;
        
        if (unreadCount > 0) {
          let displayName = ch.name;
          if (ch.is_im && ch.user) {
            displayName = await resolveUserName(ch.user);
          }
          
          unreadSummary.push({
            channel: displayName || ch.id,
            channelId: ch.id,
            type: ch.is_im ? 'dm' : ch.is_mpim ? 'group_dm' : ch.is_private ? 'private' : 'public',
            unreadCount
          });
        }
      } catch {
        // Skip inaccessible channels
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          totalUnreadChannels: unreadSummary.length,
          channels: unreadSummary.sort((a, b) => b.unreadCount - a.unreadCount)
        }, null, 2)
      }]
    };
  }

  if (name === 'get_channel_new_messages') {
    const channel = args?.channel as string;
    const limit = (args?.limit as number) || 30;
    const authTest = await callSlackApi('auth.test', 'POST');
    const myUserId = authTest.user_id;
    
    // Get last_read timestamp for this channel
    const info = await callSlackApi('conversations.info', 'GET', { channel });
    const lastRead = info.channel?.last_read;
    
    const historyParams: any = { channel, limit };
    if (lastRead && lastRead !== '0000000000.000000') {
      historyParams.oldest = lastRead;
    }
    
    const history = await callSlackApi('conversations.history', 'GET', historyParams);
    const messages = history.messages || [];
    const resolved = await resolveUserNames(messages);
    
    const formatted = resolved.map((m: any) => ({
      sender: m.sender_name,
      senderId: m.user,
      text: m.text,
      date: new Date(parseFloat(m.ts) * 1000).toISOString(),
      isThread: !!m.thread_ts,
      replyCount: m.reply_count || 0
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          channel: info.channel?.name || channel,
          messageCount: formatted.length,
          hasMore: history.has_more || false,
          messages: formatted
        }, null, 2)
      }]
    };
  }

  if (name === 'search_slack_messages') {
    const query = args?.query as string;
    const count = (args?.count as number) || 20;
    const sort = (args?.sort as string) || 'timestamp';
    
    const searchResult = await callSlackApi('search.messages', 'GET', {
      query,
      count,
      sort,
      sort_dir: 'desc'
    });
    const matches = searchResult.messages?.matches || [];
    
    const results = [];
    for (const m of matches) {
      const senderName = await resolveUserName(m.user || m.username);
      results.push({
        channel: m.channel?.name || m.channel?.id,
        channelId: m.channel?.id,
        sender: senderName,
        text: m.text,
        date: new Date(parseFloat(m.ts) * 1000).toISOString(),
        permalink: m.permalink
      });
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          resultCount: results.length,
          totalMatches: searchResult.messages?.total || 0,
          results
        }, null, 2)
      }]
    };
  }

  if (name === 'slack_get_channels') {
    const types = (args?.types as string) || 'public_channel';
    const limit = (args?.limit as number) || 100;
    const data = await callSlackApi('users.conversations', 'GET', { types, limit, exclude_archived: true });
    const channels = (data.channels || []).map((ch: any) => ({
      id: ch.id,
      name: ch.name,
      type: ch.is_im ? 'dm' : ch.is_mpim ? 'group_dm' : ch.is_private ? 'private' : 'public',
      topic: ch.topic?.value || '',
      purpose: ch.purpose?.value || '',
      numMembers: ch.num_members
    }));
    return { content: [{ type: 'text', text: JSON.stringify(channels, null, 2) }] };
  }

  if (name === 'slack_get_channel_history') {
    const channel = args?.channel as string;
    const limit = (args?.limit as number) || 50;
    const oldest = args?.oldest as string;
    const latest = args?.latest as string;
    
    const data = await callSlackApi('conversations.history', 'GET', { channel, limit, oldest, latest });
    const messages = await resolveUserNames(data.messages || []);
    const formatted = messages.map((m: any) => ({
      sender: m.sender_name,
      text: m.text,
      date: new Date(parseFloat(m.ts) * 1000).toISOString(),
      ts: m.ts,
      isThread: !!m.thread_ts,
      replyCount: m.reply_count || 0
    }));
    return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
  }

  if (name === 'slack_get_user_info') {
    const userId = args?.user as string;
    const data = await callSlackApi('users.info', 'GET', { user: userId });
    const user = data.user;
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: user.id,
          name: user.name,
          realName: user.real_name,
          displayName: user.profile?.display_name,
          email: user.profile?.email,
          title: user.profile?.title,
          isBot: user.is_bot,
          timezone: user.tz_label
        }, null, 2)
      }]
    };
  }

  if (name === 'slack_post_message') {
    const channel = args?.channel as string;
    const text = args?.text as string;
    const thread_ts = args?.thread_ts as string;
    
    const data = await callSlackApi('chat.postMessage', 'POST', { channel, text, thread_ts });
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ts: data.ts, channel: data.channel }, null, 2) }] };
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
