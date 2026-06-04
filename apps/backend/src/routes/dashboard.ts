import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { schedules } from '@trigger.dev/sdk';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// ─── TODOS ──────────────────────────────────────────────────────────────────

// Get all todos for a user
router.get('/todos', async (req: Request, res: Response) => {
  const { userId, status, limit: limitStr, offset: offsetStr } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const limit = Math.min(parseInt(limitStr as string) || 20, 100);
  const offset = parseInt(offsetStr as string) || 0;

  let query = supabase
    .from('todos')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  } else {
    query = query.eq('status', 'pending');
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ todos: data, total: count ?? 0, hasMore: (count ?? 0) > offset + limit });
});

// Create a todo
router.post('/todos', async (req: Request, res: Response) => {
  const { userId, title, description, source, source_permalink, priority, due_date } = req.body;
  if (!userId || !title) return res.status(400).json({ error: 'userId and title are required' });

  const { data, error } = await supabase
    .from('todos')
    .insert({
      user_id: userId,
      title,
      description: description || null,
      source: source || 'manual',
      source_permalink: source_permalink || null,
      priority: priority || 0,
      due_date: due_date || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ todo: data });
});

// Update a todo (mark done, dismiss, edit)
router.patch('/todos/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId, ...updates } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  // Only allow safe fields
  const allowed = ['title', 'description', 'status', 'priority', 'due_date'];
  const safeUpdates: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) safeUpdates[key] = updates[key];
  }

  const { data, error } = await supabase
    .from('todos')
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ todo: data });
});

// Delete a todo
router.delete('/todos/:id', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { error } = await supabase
    .from('todos')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─── REPORTS ────────────────────────────────────────────────────────────────

// Get saved reports for a user
router.get('/reports', async (req: Request, res: Response) => {
  const { userId, type, limit: limitStr, offset: offsetStr } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const limit = Math.min(parseInt(limitStr as string) || 10, 50);
  const offset = parseInt(offsetStr as string) || 0;

  let query = supabase
    .from('reports')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('generated_at', { ascending: false });

  if (type) {
    query = query.eq('report_type', type);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ reports: data, total: count ?? 0, hasMore: (count ?? 0) > offset + limit });
});

// Get a single report
router.get('/reports/:id', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ report: data });
});

// ─── SCHEDULES ──────────────────────────────────────────────────────────────

// Get user's report schedules
router.get('/schedules', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { data, error } = await supabase
    .from('user_schedules')
    .select('*')
    .eq('user_id', userId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ schedules: data });
});

// Create or update a schedule
router.put('/schedules', async (req: Request, res: Response) => {
  const { userId, schedule_type, enabled, time_utc, day_of_week, timezone, delivery_channel } = req.body;
  if (!userId || !schedule_type) return res.status(400).json({ error: 'userId and schedule_type are required' });

  // Convert time to cron format (HH:mm → MM HH * * *)
  const [hours, minutes] = time_utc.split(':');
  const cronExpression = `${minutes} ${hours} * * *`;

  try {
    // Resolve whether schedule should be enabled (check DB if enabled is not passed in the request)
    let finalEnabled = enabled;
    if (enabled === undefined) {
      const { data: existing } = await supabase
        .from('user_schedules')
        .select('enabled')
        .eq('user_id', userId)
        .eq('schedule_type', schedule_type)
        .maybeSingle();
      finalEnabled = existing?.enabled ?? true;
    }

    // Register/update schedule with Trigger.dev
    if (finalEnabled) {
      await schedules.create({
        task: "generate-scheduled-report",
        cron: cronExpression,
        externalId: `${userId}-${schedule_type}`,
        deduplicationKey: `${userId}-${schedule_type}`,
        timezone: timezone || 'UTC',
      });
    } else {
      // Disable/delete the schedule
      const activeSchedules = await schedules.list();
      const existing = activeSchedules.data.find(s => s.externalId === `${userId}-${schedule_type}`);
      if (existing) {
        await schedules.del(existing.id);
      }
    }

    // Save to database
    const { data, error } = await supabase
      .from('user_schedules')
      .upsert({
        user_id: userId,
        schedule_type,
        enabled: finalEnabled,
        time_utc: time_utc || '09:00',
        day_of_week: day_of_week ?? null,
        timezone: timezone || 'UTC',
        delivery_channel: delivery_channel || 'slack',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id, schedule_type' })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    
    res.json({ 
      schedule: data,
      cronExpression,
      status: finalEnabled ? 'scheduled' : 'disabled'
    });
  } catch (triggerError) {
    console.error('Trigger.dev schedule error:', triggerError);
    return res.status(500).json({ 
      error: 'Failed to schedule with Trigger.dev',
      triggerError: triggerError instanceof Error ? triggerError.message : triggerError 
    });
  }
});

let cachedTimezones: { value: string; label: string; offset: string }[] | null = null;

// Get available timezones from Trigger.dev
router.get('/timezones', async (req: Request, res: Response) => {
  if (cachedTimezones) {
    return res.json({ timezones: cachedTimezones });
  }

  try {
    const { timezones } = await schedules.timezones();
    
    const mapped = timezones.map(tz => {
      let offsetStr = 'GMT+00:00';
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'longOffset'
        }).formatToParts(new Date());
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        if (tzPart) {
          offsetStr = tzPart.value;
        }
      } catch (err) {
        // Fallback
      }
      return {
        value: tz,
        label: `${tz} (${offsetStr})`,
        offset: offsetStr
      };
    });

    mapped.sort((a, b) => a.value.localeCompare(b.value));

    cachedTimezones = mapped;
    res.json({ timezones: mapped });
  } catch (error) {
    console.error('Failed to fetch Trigger.dev timezones:', error);
    res.status(500).json({ error: 'Failed to fetch timezones from Trigger.dev' });
  }
});

export default router;
