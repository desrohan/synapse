import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data } = await supabase.from('user_integrations').select('*').eq('provider', 'jira').limit(1).single();

const baseUrl = `https://api.atlassian.com/ex/jira/${data.metadata.cloud_id}`;

try {
  console.log("Testing GET /rest/api/3/search...");
  const res1 = await fetch(`${baseUrl}/rest/api/3/search?jql=assignee=currentUser()`, {
    headers: { 'Authorization': `Bearer ${data.access_token}` }
  });
  console.log("GET /rest/api/3/search status:", res1.status);
  console.log(await res1.text());

  console.log("Testing POST /rest/api/3/search/jql...");
  const res2 = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${data.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql: 'assignee=currentUser()' })
  });
  console.log("POST /rest/api/3/search/jql status:", res2.status);
  console.log(await res2.text());
} catch (e) {
  console.error(e);
}
