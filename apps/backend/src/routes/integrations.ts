import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { mcpManager } from '../mcp/index.js';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// STATUS ROUTE
router.get('/status', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send('userId is required');

  try {
    const { data, error } = await supabase
      .from('user_integrations')
      .select('provider')
      .eq('user_id', userId);

    if (error) throw error;

    const connectedProviders = data.map(d => d.provider);
    res.json({ connected: connectedProviders });
  } catch (error: any) {
    console.error('Error fetching integration status:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GITHUB OAUTH FLOW
router.get('/github/authorize', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send('userId is required');
  
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = encodeURIComponent(`${process.env.BACKEND_URL}/api/integrations/github/callback`);
  
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${userId}&scope=repo,read:user`;
  res.redirect(githubAuthUrl);
});

router.get('/github/callback', async (req, res) => {
  const { code, state: userId } = req.query;

  if (!code || !userId) return res.status(400).send('Missing code or state');

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      })
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) throw new Error('Failed to obtain access token');

    // Save token to Supabase
    await supabase.from('user_integrations').upsert({
      user_id: userId,
      provider: 'github',
      access_token: accessToken,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id, provider' });

    // Dynamically boot the MCP server for this user
    await mcpManager.connectStdioServer(
      `github-${userId}`,
      'npx',
      ['-y', '@modelcontextprotocol/server-github'],
      { GITHUB_PERSONAL_ACCESS_TOKEN: accessToken }
    );

    // Redirect back to frontend
    res.redirect(`${process.env.FRONTEND_URL}/?integration=success`);
  } catch (error: any) {
    console.error('GitHub OAuth Error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/?integration=error`);
  }
});

// SLACK OAUTH FLOW
router.get('/slack/authorize', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send('userId is required');
  
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = encodeURIComponent(`${process.env.BACKEND_URL}/api/integrations/slack/callback`);
  
  // We use user_scope to get a user token (xoxp-) so Synapse can read ANY channel the user can read,
  // without needing the bot to be explicitly invited to every channel.
  const userScopes = 'channels:history,channels:read,groups:history,groups:read,mpim:history,mpim:read,im:history,im:read,users:read,search:read';
  const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&state=${userId}&user_scope=${userScopes}`;
  res.redirect(slackAuthUrl);
});

router.get('/slack/callback', async (req, res) => {
  const { code, state: userId } = req.query;

  if (!code || !userId) return res.status(400).send('Missing code or state');

  try {
    const params = new URLSearchParams();
    params.append('client_id', process.env.SLACK_CLIENT_ID || '');
    params.append('client_secret', process.env.SLACK_CLIENT_SECRET || '');
    params.append('code', code.toString());

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.ok) throw new Error(tokenData.error);

    // Prefer the User Token (xoxp-) so we can read any channel the user has access to
    const accessToken = tokenData.authed_user?.access_token || tokenData.access_token;
    const teamId = tokenData.team?.id;
    const slackUserId = tokenData.authed_user?.id;

    // Resolve slack username via auth.test if possible
    let slackUsername = '';
    try {
      const authTestResp = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const authTestData = await authTestResp.json();
      if (authTestData.ok) {
        slackUsername = authTestData.user;
      }
    } catch (e) {
      console.error("Failed to fetch username during OAuth callback:", e);
    }

    await supabase.from('user_integrations').upsert({
      user_id: userId,
      provider: 'slack',
      access_token: accessToken,
      metadata: { team_id: teamId, slack_user_id: slackUserId, slack_username: slackUsername },
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id, provider' });

    // Dynamically boot the custom Slack MCP server
    await mcpManager.connectStdioServer(
      `slack-${userId}`,
      'npx',
      ['tsx', 'src/mcp/servers/slack.ts'],
      { 
        SLACK_BOT_TOKEN: accessToken,
        SLACK_TEAM_ID: teamId 
      }
    );

    res.redirect(`${process.env.FRONTEND_URL}/?integration=success`);
  } catch (error: any) {
    console.error('Slack OAuth Error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/?integration=error`);
  }
});

// JIRA OAUTH FLOW (Atlassian 3LO)
router.get('/jira/authorize', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).send('userId is required');
  
  const clientId = process.env.JIRA_CLIENT_ID;
  const redirectUri = encodeURIComponent(`${process.env.BACKEND_URL}/api/integrations/jira/callback`);
  
  // Jira scopes for reading issues and user data
  const scopes = encodeURIComponent('read:jira-work read:jira-user offline_access');
  const jiraAuthUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${userId}&response_type=code&prompt=consent`;
  
  res.redirect(jiraAuthUrl);
});

router.get('/jira/callback', async (req, res) => {
  const { code, state: userId } = req.query;

  if (!code || !userId) return res.status(400).send('Missing code or state');

  try {
    const redirectUri = `${process.env.BACKEND_URL}/api/integrations/jira/callback`;
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://auth.atlassian.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.JIRA_CLIENT_ID,
        client_secret: process.env.JIRA_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'Failed to get Jira token');

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    // Get the Cloud ID (site ID) since Atlassian tokens are generic
    const resourcesResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const resources = await resourcesResponse.json();
    
    if (!resources || resources.length === 0) throw new Error('No Jira sites authorized');
    const cloudId = resources[0].id;
    const baseUrl = resources[0].url;

    // Save tokens and metadata to Supabase
    await supabase.from('user_integrations').upsert({
      user_id: userId,
      provider: 'jira',
      access_token: accessToken,
      refresh_token: refreshToken,
      metadata: { cloud_id: cloudId, base_url: baseUrl },
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id, provider' });

    // Dynamically boot the MCP server using our custom implementation
    // This gives us full control over using Atlassian's v3 API instead of the deprecated v2 API
    await mcpManager.connectStdioServer(
      `jira-${userId}`,
      'npx',
      ['tsx', 'src/mcp/servers/jira.ts'],
      { 
        ...process.env,
        JIRA_ACCESS_TOKEN: accessToken,
        JIRA_REFRESH_TOKEN: refreshToken,
        JIRA_CLOUD_ID: cloudId,
        JIRA_USER_ID: userId as string
      }
    );

    res.redirect(`${process.env.FRONTEND_URL}/?integration=success`);
  } catch (error: any) {
    console.error('Jira OAuth Error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/?integration=error`);
  }
});

// DISCONNECT INTEGRATION
router.delete('/:provider', async (req, res) => {
  const { provider } = req.params;
  const { userId } = req.query;

  if (!userId || !provider) return res.status(400).send('userId and provider are required');

  try {
    const { error } = await supabase
      .from('user_integrations')
      .delete()
      .match({ user_id: userId, provider });

    if (error) throw error;

    // Disconnect the MCP server
    mcpManager.disconnectServer(`${provider}-${userId}`);

    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error disconnecting ${provider}:`, error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
