-- Add user_id to graph_nodes
ALTER TABLE graph_nodes 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create an index to quickly filter nodes by user
CREATE INDEX idx_graph_nodes_user_id ON graph_nodes (user_id);

-- Update the unique constraint on external_id to also include user_id.
-- (Two different users might theoretically interact with the same external entity, 
-- or we want their graphs isolated completely).
ALTER TABLE graph_nodes DROP CONSTRAINT IF EXISTS idx_graph_nodes_external;
DROP INDEX IF EXISTS idx_graph_nodes_external;

CREATE UNIQUE INDEX idx_graph_nodes_user_external ON graph_nodes (user_id, type, external_id) WHERE external_id IS NOT NULL;

-- Add user_id to graph_edges (optional, but good for security/filtering)
ALTER TABLE graph_edges 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX idx_graph_edges_user_id ON graph_edges (user_id);
