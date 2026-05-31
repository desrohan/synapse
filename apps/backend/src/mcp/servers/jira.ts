import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createClient } from '@supabase/supabase-js';

let accessToken = process.env.JIRA_ACCESS_TOKEN;
let refreshToken = process.env.JIRA_REFRESH_TOKEN;
const cloudId = process.env.JIRA_CLOUD_ID;
const userId = process.env.JIRA_USER_ID;

const clientId = process.env.JIRA_CLIENT_ID;
const clientSecret = process.env.JIRA_CLIENT_SECRET;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

if (!accessToken || !cloudId) {
  console.error("JIRA_ACCESS_TOKEN and JIRA_CLOUD_ID are required");
  process.exit(1);
}

const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}`;

const server = new Server({
  name: 'synapse-jira-server',
  version: '1.0.0',
}, {
  capabilities: { tools: {} }
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_issues',
      description: 'Search Jira issues using JQL (Jira Query Language)',
      inputSchema: {
        type: 'object',
        properties: {
          jql: { type: 'string', description: 'The JQL query string (e.g. "assignee = currentUser() AND status = \\"To Do\\"")' },
          maxResults: { type: 'number', description: 'Maximum number of results to return (default: 50)' }
        },
        required: ['jql']
      }
    },
    {
      name: 'get_issue',
      description: 'Get details of a specific Jira issue by its key',
      inputSchema: {
        type: 'object',
        properties: {
          issueKey: { type: 'string', description: 'The Jira issue key (e.g. CUI-123)' }
        },
        required: ['issueKey']
      }
    }
  ]
}));

async function refreshJiraToken() {
  if (!refreshToken || !clientId || !clientSecret || !supabase || !userId) {
    throw new Error("Missing required credentials for token refresh");
  }
  
  const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    })
  });
  
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || "Failed to refresh token");
  }
  
  accessToken = tokenData.access_token;
  refreshToken = tokenData.refresh_token || refreshToken;
  
  // Update database
  await supabase.from('user_integrations').update({
    access_token: accessToken,
    refresh_token: refreshToken,
    updated_at: new Date().toISOString()
  }).match({ user_id: userId, provider: 'jira' });
  
  console.error("Successfully refreshed Jira token!");
}

async function executeTool(request: any) {
  const { name, arguments: args } = request.params;
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  if (name === 'search_issues') {
    const jql = args?.jql as string;
    const maxResults = (args?.maxResults as number) || 50;
    
    const searchUrl = `${baseUrl}/rest/api/3/search/jql`;
    const body = JSON.stringify({
      jql,
      maxResults,
      fields: ['summary', 'status', 'assignee', 'priority', 'issuetype']
    });

    const resp = await fetch(searchUrl, {
      method: 'POST',
      headers,
      body
    });
    if (resp.status === 401) throw new Error("401 Unauthorized");
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    
    const issues = data.issues.map((i: any) => ({
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status?.name,
      assignee: i.fields.assignee?.displayName || 'Unassigned',
      type: i.fields.issuetype?.name
    }));
    
    return { content: [{ type: 'text', text: JSON.stringify(issues, null, 2) }] };
  }

  if (name === 'get_issue') {
    const issueKey = args?.issueKey as string;
    const resp = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}`, { headers });
    if (resp.status === 401) throw new Error("401 Unauthorized");
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    return await executeTool(request);
  } catch (error: any) {
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      try {
        console.error("Jira token expired, attempting refresh...");
        await refreshJiraToken();
        return await executeTool(request); // Retry
      } catch (refreshErr: any) {
        return { content: [{ type: 'text', text: `Jira Auth Error: Token expired and refresh failed. Please hover over the 'Connected' button in Integrations to Disconnect and Connect again.` }], isError: true };
      }
    }
    return { content: [{ type: 'text', text: `Jira API Error: ${error.message}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Jira Custom MCP Server running on stdio');
}

main().catch(console.error);
