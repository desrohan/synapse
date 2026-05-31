-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Temporal Memory: Raw Events
-- Stores the time-series log of all state changes, webhooks, and raw integrations
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source VARCHAR(50) NOT NULL, -- e.g. 'slack', 'jira', 'github'
    event_type VARCHAR(100) NOT NULL, -- e.g. 'message_posted', 'issue_created'
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    external_id VARCHAR(255), -- ID in the external system for deduplication
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for processing queues
CREATE INDEX idx_events_unprocessed ON events (processed, created_at);
CREATE INDEX idx_events_external_id ON events (source, external_id);

-- 2. Vector Memory: Semantic Embeddings
-- Stores generated summaries, document chunks, and conversation notes
CREATE TABLE memory_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL, -- e.g. 'summary', 'document', 'conversation'
    entity_id VARCHAR(255) NOT NULL, -- Logical ID linking to the original source/graph node
    content TEXT NOT NULL,
    embedding vector(1536), -- Assuming Gemini/OpenAI 1536-dim embeddings
    metadata JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- HNSW Index for fast semantic search similarity queries
CREATE INDEX memory_embeddings_idx ON memory_embeddings USING hnsw (embedding vector_cosine_ops);

-- 3. Automations
-- Stores declarative workflow configurations and delivery preferences
CREATE TABLE automations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trigger_type VARCHAR(100) NOT NULL, -- e.g. 'blocker_detected', 'daily_summary'
    delivery_preference VARCHAR(50) NOT NULL DEFAULT 'in_app', -- 'push', 'in_app', 'digest'
    is_active BOOLEAN DEFAULT TRUE,
    config JSONB DEFAULT '{}'::JSONB,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. User Configuration
-- Extend Supabase auth if needed, but we can store Synapse-specific settings here
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY, -- Would typically FK to auth.users in Supabase
    timezone VARCHAR(50) DEFAULT 'UTC',
    daily_summary_time TIME DEFAULT '08:00',
    dnd_start TIME,
    dnd_end TIME,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_memory_embeddings_updated_at
BEFORE UPDATE ON memory_embeddings
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
