import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// ─── LIST THREADS ───────────────────────────────────────────────────────────

router.get('/threads', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { data, error } = await supabase
    .from('chat_threads')
    .select('id, title, head_id, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ threads: data || [] });
});

// ─── GET THREAD WITH MESSAGES ───────────────────────────────────────────────

router.get('/threads/:id', async (req: Request, res: Response) => {
  const { userId } = req.query;
  const { id } = req.params;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId as string)
    .single();

  if (threadError) return res.status(404).json({ error: 'Thread not found' });

  const { data: messages, error: msgError } = await supabase
    .from('chat_messages')
    .select('id, parent_id, format, content')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });

  if (msgError) return res.status(500).json({ error: msgError.message });

  res.json({
    ...thread,
    messages: messages || [],
  });
});

// ─── APPEND MESSAGE ─────────────────────────────────────────────────────────

router.post('/threads/:id/messages', async (req: Request, res: Response) => {
  const { id: threadId } = req.params;
  const { userId, id, parentId, format, content, headId } = req.body;
  if (!userId || !id) return res.status(400).json({ error: 'userId and id are required' });

  // Ensure thread exists
  const { data: existing } = await supabase
    .from('chat_threads')
    .select('id, title')
    .eq('id', threadId)
    .maybeSingle();

  if (!existing) {
    // Create thread — try to extract title from first user message content
    let title = 'New Chat';
    if (content && content.role === 'user' && Array.isArray(content.parts)) {
      const textPart = content.parts.find((p: any) => p.type === 'text');
      if (textPart?.text) {
        title = textPart.text.substring(0, 100);
      }
    }
    const { error: createError } = await supabase.from('chat_threads').insert({
      id: threadId,
      user_id: userId,
      title,
      head_id: headId || id,
    });
    if (createError) return res.status(500).json({ error: createError.message });
  }

  // Upsert message
  const { error: msgError } = await supabase.from('chat_messages').upsert(
    {
      id,
      thread_id: threadId,
      parent_id: parentId || null,
      format: format || 'ai-sdk',
      content,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'thread_id, id' }
  );

  if (msgError) return res.status(500).json({ error: msgError.message });

  // Update head_id and timestamp
  await supabase
    .from('chat_threads')
    .update({ head_id: headId || id, updated_at: new Date().toISOString() })
    .eq('id', threadId);

  res.json({ success: true });
});

// ─── UPDATE MESSAGE ─────────────────────────────────────────────────────────

router.put('/threads/:threadId/messages/:messageId', async (req: Request, res: Response) => {
  const { threadId, messageId } = req.params;
  const { userId, id, parentId, format, content, headId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  // Delete old message if ID changed
  if (messageId !== id) {
    await supabase
      .from('chat_messages')
      .delete()
      .eq('thread_id', threadId)
      .eq('id', messageId);
  }

  // Upsert new message
  await supabase.from('chat_messages').upsert(
    {
      id,
      thread_id: threadId,
      parent_id: parentId || null,
      format: format || 'ai-sdk',
      content,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'thread_id, id' }
  );

  // Update head
  await supabase
    .from('chat_threads')
    .update({ head_id: headId || id, updated_at: new Date().toISOString() })
    .eq('id', threadId);

  res.json({ success: true });
});

// ─── UPDATE THREAD TITLE ────────────────────────────────────────────────────

router.put('/threads/:id/title', async (req: Request, res: Response) => {
  const { userId, title } = req.body;
  if (!userId || !title) return res.status(400).json({ error: 'userId and title are required' });

  await supabase
    .from('chat_threads')
    .update({ title })
    .eq('id', req.params.id)
    .eq('user_id', userId);

  res.json({ success: true });
});

// ─── DELETE THREAD ──────────────────────────────────────────────────────────

router.delete('/threads/:id', async (req: Request, res: Response) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', userId as string);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

export default router;
