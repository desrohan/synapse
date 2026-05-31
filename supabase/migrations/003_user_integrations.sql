-- Stores connected integrations and their OAuth tokens per user
CREATE TABLE user_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- Would typically reference auth.users if Supabase Auth was fully active
    provider VARCHAR(50) NOT NULL, -- 'github', 'slack', 'jira'
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    metadata JSONB DEFAULT '{}'::JSONB, -- E.g. Slack Team ID or Jira Base URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider) -- One integration type per user
);

CREATE TRIGGER update_user_integrations_updated_at
BEFORE UPDATE ON user_integrations
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
