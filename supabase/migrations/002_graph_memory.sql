-- 1. Graph Nodes
-- Stores distinct entities (Person, Project, Ticket, Blocker)
CREATE TABLE graph_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL, -- e.g. 'Person', 'Ticket'
    external_id VARCHAR(255), -- ID in the external system (e.g. Jira Issue Key, Slack User ID)
    properties JSONB DEFAULT '{}'::JSONB, -- Flexible attributes (name, status, url)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint to prevent duplicate nodes for the same external entity
CREATE UNIQUE INDEX idx_graph_nodes_external ON graph_nodes (type, external_id) WHERE external_id IS NOT NULL;
-- Index for quick type filtering
CREATE INDEX idx_graph_nodes_type ON graph_nodes (type);

-- 2. Graph Edges
-- Stores the relationships between nodes (WORKS_ON, BLOCKED_BY)
CREATE TABLE graph_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_node_id UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    target_node_id UUID NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
    relation_type VARCHAR(50) NOT NULL, -- e.g. 'WORKS_ON', 'BLOCKED_BY'
    properties JSONB DEFAULT '{}'::JSONB, -- E.g. weight, context of relation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_node_id, target_node_id, relation_type) -- Prevent duplicate identical edges
);

-- Indexes for bidirectional graph traversal
CREATE INDEX idx_graph_edges_source ON graph_edges (source_node_id);
CREATE INDEX idx_graph_edges_target ON graph_edges (target_node_id);
CREATE INDEX idx_graph_edges_type ON graph_edges (relation_type);

-- Triggers to automatically update updated_at timestamps
CREATE TRIGGER update_graph_nodes_updated_at
BEFORE UPDATE ON graph_nodes
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_graph_edges_updated_at
BEFORE UPDATE ON graph_edges
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
