import { mcpManager } from './index.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

let resolveBootstrap: () => void;
export const mcpReady = new Promise<void>((resolve) => {
  resolveBootstrap = resolve;
});

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Bootstraps all configured MCP servers based on active integrations in the database.
 */
export async function bootstrapMCPServers() {
  console.log('Bootstrapping MCP Servers from Database...');

  const { data: integrations, error } = await supabase
    .from('user_integrations')
    .select('*');

  if (error || !integrations) {
    console.warn('⚠️ Failed to fetch integrations from database:', error?.message);
    return;
  }

  for (const integration of integrations) {
    const { user_id, provider, access_token, metadata } = integration;
    const clientName = `${provider}-${user_id}`;

    try {
      if (provider === 'github') {
        await mcpManager.connectStdioServer(
          clientName,
          'npx',
          ['-y', '@modelcontextprotocol/server-github'],
          { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: access_token }
        );
      } else if (provider === 'slack') {
        // Use our custom Slack MCP server with aggregate feed tools
        await mcpManager.connectStdioServer(
          clientName,
          'npx',
          ['tsx', 'src/mcp/servers/slack.ts'],
          { 
            ...process.env, 
            SLACK_BOT_TOKEN: access_token,
            SLACK_TEAM_ID: metadata?.team_id || ''
          }
        );
      } else if (provider === 'jira') {
        // Use our custom Jira MCP server with Atlassian OAuth tokens
        await mcpManager.connectStdioServer(
          clientName,
          'npx',
          ['tsx', 'src/mcp/servers/jira.ts'],
          { 
            ...process.env, 
            JIRA_ACCESS_TOKEN: access_token,
            JIRA_REFRESH_TOKEN: integration.refresh_token || '',
            JIRA_CLOUD_ID: metadata?.cloud_id || '',
            JIRA_USER_ID: user_id
          }
        );
      }
      console.log(`✅ ${provider.toUpperCase()} MCP connected successfully for user ${user_id}.`);
    } catch (err: any) {
      console.error(`❌ Failed to connect ${provider} MCP for user ${user_id}:`, err.message);
    }
  }

  resolveBootstrap();
  console.log('MCP bootstrap complete — all servers ready.');
}

/**
 * Bootstraps MCP servers for a specific user.
 */
export async function bootstrapMCPServersForUser(userId: string) {
  // If already connected, do not reconnect
  const allClientNames = mcpManager.getAllClientNames();
  const userClients = allClientNames.filter(name => name.endsWith(userId));
  if (userClients.length > 0) {
    return;
  }

  const { data: integrations, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId);

  if (error || !integrations) {
    console.warn(`⚠️ Failed to fetch integrations for user ${userId}:`, error?.message);
    return;
  }

  for (const integration of integrations) {
    const { provider, access_token, metadata } = integration;
    const clientName = `${provider}-${userId}`;

    try {
      if (provider === 'github') {
        await mcpManager.connectStdioServer(
          clientName,
          'npx',
          ['-y', '@modelcontextprotocol/server-github'],
          { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: access_token }
        );
      } else if (provider === 'slack') {
        await mcpManager.connectStdioServer(
          clientName,
          'npx',
          ['tsx', 'src/mcp/servers/slack.ts'],
          { 
            ...process.env, 
            SLACK_BOT_TOKEN: access_token,
            SLACK_TEAM_ID: metadata?.team_id || ''
          }
        );
      } else if (provider === 'jira') {
        await mcpManager.connectStdioServer(
          clientName,
          'npx',
          ['tsx', 'src/mcp/servers/jira.ts'],
          { 
            ...process.env, 
            JIRA_ACCESS_TOKEN: access_token,
            JIRA_REFRESH_TOKEN: integration.refresh_token || '',
            JIRA_CLOUD_ID: metadata?.cloud_id || '',
            JIRA_USER_ID: userId
          }
        );
      }
      console.log(`✅ ${provider.toUpperCase()} MCP connected successfully for user ${userId}.`);
    } catch (err: any) {
      console.error(`❌ Failed to connect ${provider} MCP for user ${userId}:`, err.message);
    }
  }
}

