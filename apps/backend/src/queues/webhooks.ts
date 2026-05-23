import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

export const webhookQueue = new Queue('webhook-events', { connection });
export const webhookQueueEvents = new QueueEvents('webhook-events', { connection });

export const webhookWorker = new Worker('webhook-events', async (job) => {
  console.log(`Processing webhook event ${job.id}:`, job.data);
  // Here we will eventually pass this event to the Gemini LLM pipeline for entity extraction
  
  const { source, event_type, payload } = job.data;
  
  // Return early if no payload
  if (!payload) return { status: 'skipped', reason: 'no payload' };
  
  return { status: 'success', processed: true };
}, { connection });

webhookWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

webhookWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});
