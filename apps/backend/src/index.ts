import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

import integrationsRouter from './routes/integrations.js';
import webhooksRouter from './routes/webhooks.js';
import chatRouter from './routes/chat.js';

app.use('/api/integrations', integrationsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/chat', chatRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'synapse-backend' });
});

import { bootstrapMCPServers } from './mcp/bootstrap.js';

app.listen(port, async () => {
  console.log(`Synapse backend listening on port ${port}`);
  await bootstrapMCPServers();
});
