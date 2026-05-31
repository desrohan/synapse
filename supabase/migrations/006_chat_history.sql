-- ============================================================================
-- 006: Chat history — Persistent chat threads and messages
-- ============================================================================

CREATE TABLE chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Chat',
    head_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_threads_user ON chat_threads (user_id, updated_at DESC);

-- Messages use the assistant-ui MessageStorageEntry format:
-- id = message ID from the runtime (string, not UUID)
-- parent_id = parent message ID (for branching)
-- format = message format identifier (e.g. 'ai-sdk')
-- content = encoded message payload (JSONB)
CREATE TABLE chat_messages (
    id TEXT NOT NULL,
    thread_id UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    parent_id TEXT,
    format TEXT NOT NULL DEFAULT 'ai-sdk',
    content JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (thread_id, id)
);

CREATE INDEX idx_chat_messages_thread ON chat_messages (thread_id);
