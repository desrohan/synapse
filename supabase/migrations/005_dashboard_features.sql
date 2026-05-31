-- ============================================================================
-- 005: Dashboard features — Todos, Scheduled Reports, Automations
-- ============================================================================

-- Drop existing tables from partial previous runs
DROP TABLE IF EXISTS todos CASCADE;
DROP TABLE IF EXISTS reports CASCADE;
DROP TABLE IF EXISTS user_schedules CASCADE;
DROP TABLE IF EXISTS automations CASCADE;

-- ─── Todos ──────────────────────────────────────────────────────────────────
-- Auto-extracted from reports or manually created by user
CREATE TABLE todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    source VARCHAR(50), -- 'slack', 'jira', 'github', 'manual'
    source_permalink TEXT, -- link to original message/issue
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'done', 'dismissed'
    priority INTEGER DEFAULT 0, -- higher = more important
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_todos_user_status ON todos (user_id, status);
CREATE INDEX idx_todos_user_created ON todos (user_id, created_at DESC);

-- ─── Saved Reports ──────────────────────────────────────────────────────────
-- Stores generated reports for the dashboard shelf
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    subtitle TEXT,
    report_type VARCHAR(20) NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'custom'
    data JSONB NOT NULL DEFAULT '{}'::JSONB, -- full report payload (actionItems, updates, channelSummaries)
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reports_user_type ON reports (user_id, report_type, generated_at DESC);

-- ─── User Schedules ─────────────────────────────────────────────────────────
-- Configurable report schedules per user
CREATE TABLE user_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    schedule_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly'
    enabled BOOLEAN NOT NULL DEFAULT true,
    time_utc TIME NOT NULL DEFAULT '09:00', -- when to generate (UTC)
    day_of_week INTEGER, -- 0=Sun, 1=Mon...6=Sat (for weekly only)
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    delivery_channel VARCHAR(20) NOT NULL DEFAULT 'slack', -- 'slack', 'email', 'in_app'
    last_run_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, schedule_type)
);

-- ─── Automations ────────────────────────────────────────────────────────────
-- User-defined automations with NLP conditions
CREATE TABLE automations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT, -- human-readable description
    enabled BOOLEAN NOT NULL DEFAULT true,
    trigger_type VARCHAR(50) NOT NULL, -- 'slack_message', 'jira_update', 'github_event', 'schedule', 'mention'
    condition_nlp TEXT, -- natural language condition, e.g. "when someone mentions a blocker in #dev"
    condition_parsed JSONB, -- LLM-parsed structured condition
    actions JSONB NOT NULL DEFAULT '[]'::JSONB, -- array of actions: [{type: 'notify_slack', params: {...}}, {type: 'create_todo', params: {...}}]
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_automations_user ON automations (user_id, enabled);
CREATE INDEX idx_automations_trigger ON automations (trigger_type, enabled);

-- ─── Fix graph_nodes partial index (ON CONFLICT doesn't work with WHERE clause)
DROP INDEX IF EXISTS idx_graph_nodes_user_external;
CREATE UNIQUE INDEX idx_graph_nodes_user_external ON graph_nodes (user_id, type, external_id);
