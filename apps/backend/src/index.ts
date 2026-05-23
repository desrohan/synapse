import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3002;

import { webhookQueue } from './queues/webhooks';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'synapse-backend' });
});

app.post('/api/webhooks/:source', async (req, res) => {
  const { source } = req.params;
  const payload = req.body;
  const event_type = req.headers['x-event-type'] || 'unknown';

  await webhookQueue.add('process-event', {
    source,
    event_type,
    payload,
    timestamp: new Date().toISOString()
  });

  res.status(202).json({ status: 'queued' });
});

app.listen(port, () => {
  console.log(`Synapse backend listening on port ${port}`);
});
