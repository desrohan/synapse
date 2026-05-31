import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data } = await supabase.from('user_integrations').select('*').eq('provider', 'jira').limit(1).single();

const baseUrl = `https://api.atlassian.com/ex/jira/${data.metadata.cloud_id}`;
const client = axios.create({
  baseURL: `${baseUrl}/rest/api/2`,
  headers: {
    'Authorization': `Bearer ${data.access_token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

try {
  const res = await client.post('/search', { jql: 'assignee = currentUser()', maxResults: 10 });
  console.log("Success:", res.data);
} catch (e) {
  console.log("Error status:", e.response?.status);
  console.log("Error data:", e.response?.data);
  console.log("Error message:", e.message);
}
