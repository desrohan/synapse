import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// ─── Parse NLP condition into structured format ──────────────────────────────

async function parseCondition(nlpCondition: string): Promise<Record<string, any>> {
  const prompt = `You are a condition parser for a workspace automation system.
Parse the following natural language condition into a structured JSON object.

The condition describes WHEN an automation should trigger based on events from Slack, Jira, or GitHub.

Output a JSON object with these fields:
- source: "slack" | "jira" | "github" | "any"
- event_type: specific event type (e.g. "message", "mention", "issue_created", "pr_opened", "status_changed")
- filters: object with filter criteria like:
  - channel: channel name or null
  - contains_keywords: array of keywords to match
  - from_user: specific user name or null
  - priority: "high" | "medium" | "low" | null
  - labels: array of labels or null

Natural language condition: "${nlpCondition}"

Return ONLY valid JSON, no explanation.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    return JSON.parse(response.text || '{}');
  } catch (err) {
    console.error('Failed to parse automation condition:', err);
    return { raw: nlpCondition, parse_error: true };
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Get all automations for a user
router.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { data, error } = await supabase
    .from('automations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ automations: data });
});

// Create a new automation
router.post('/', async (req: Request, res: Response) => {
  const { userId, name, description, trigger_type, condition_nlp, actions } = req.body;
  if (!userId || !name || !trigger_type) {
    return res.status(400).json({ error: 'userId, name, and trigger_type are required' });
  }

  // Parse the NLP condition into structured data
  let conditionParsed = null;
  if (condition_nlp) {
    conditionParsed = await parseCondition(condition_nlp);
  }

  const { data, error } = await supabase
    .from('automations')
    .insert({
      user_id: userId,
      name,
      description: description || null,
      trigger_type,
      condition_nlp: condition_nlp || null,
      condition_parsed: conditionParsed,
      actions: actions || [],
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ automation: data });
});

// Update an automation
router.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, ...updates } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  // If condition_nlp changed, re-parse it
  if (updates.condition_nlp) {
    updates.condition_parsed = await parseCondition(updates.condition_nlp);
  }

  const allowed = ['name', 'description', 'enabled', 'trigger_type', 'condition_nlp', 'condition_parsed', 'actions'];
  const safeUpdates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = updates[key];
  }

  const { data, error } = await supabase
    .from('automations')
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ automation: data });
});

// Delete an automation
router.delete('/:id', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { error } = await supabase
    .from('automations')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Toggle automation enabled/disabled
router.post('/:id/toggle', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  // Fetch current state
  const { data: existing } = await supabase
    .from('automations')
    .select('enabled')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (!existing) return res.status(404).json({ error: 'Automation not found' });

  const { data, error } = await supabase
    .from('automations')
    .update({ enabled: !existing.enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ automation: data });
});

export default router;
