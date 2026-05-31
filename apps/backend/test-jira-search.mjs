import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data } = await supabase.from('user_integrations').select('*').eq('provider', 'jira').limit(1).single();

const baseUrl = `https://api.atlassian.com/ex/jira/${data.metadata.cloud_id}`;

try {
  const res = await fetch(`${baseUrl}/rest/api/2/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${data.access_token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ jql: 'assignee = currentUser()', maxResults: 10 })
  });
  
  console.log("Error status:", res.status);
  const text = await res.text();
  console.log("Error data:", text);
} catch (e) {
  console.log("Error message:", e.message);
}
