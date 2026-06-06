import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => {
    // Preserve raw body for webhook signature verification
    req.rawBody = buf;
  }
}));

import integrationsRouter from './routes/integrations.js';
import webhooksRouter from './routes/webhooks.js';
import chatRouter from './routes/chat.js';
import dashboardRouter from './routes/dashboard.js';
import automationsRouter from './routes/automations.js';
import chatHistoryRouter from './routes/chatHistory.js';

app.use('/api/integrations', integrationsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/chat/history', chatHistoryRouter);
app.use('/api/chat', chatRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/automations', automationsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'synapse-backend' });
});

// Cron endpoint — call this every minute from Render cron or external scheduler
app.post('/api/cron/reports', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { runScheduledReports } = await import('./scheduler/reportRunner.js');
  await runScheduledReports();
  res.json({ ok: true });
});

import { bootstrapMCPServers } from './mcp/bootstrap.js';

app.listen(port, async () => {
  console.log(`Synapse backend listening on port ${port}`);
  await bootstrapMCPServers();
});
// reload comment to restart watcher - trigger reload v3
