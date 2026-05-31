import { Router } from 'express';
import { contextProcessor } from '../llm/gemini.js';
import { graphService } from '../db/graph.js';

const router = Router();

// GITHUB WEBHOOK
router.post('/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const { action, pull_request, issue, comment, repository, sender } = req.body;

    // Scrub payload for LLM to prevent hallucination and token bloat
    const scrubbedPayload: any = {
      event,
      action,
      repository: repository?.full_name,
      sender: sender?.login,
    };

    if (pull_request) {
      scrubbedPayload.pull_request = {
        id: pull_request.id.toString(),
        number: pull_request.number,
        title: pull_request.title,
        body: pull_request.body,
        state: pull_request.state,
        url: pull_request.html_url
      };
    }
    
    if (issue) {
      scrubbedPayload.issue = {
        id: issue.id.toString(),
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        url: issue.html_url
      };
    }

    if (comment) {
      scrubbedPayload.comment = {
        id: comment.id.toString(),
        body: comment.body
      };
    }

    // Process with Gemini Structured Outputs
    const graphData = await contextProcessor.extractEntities('github', scrubbedPayload);
    
    // Upsert into Supabase Graph
    await graphService.upsertGraph(graphData);

    res.status(200).send('Processed');
  } catch (error) {
    console.error('GitHub Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// SLACK WEBHOOK
router.post('/slack', async (req, res) => {
  try {
    const { type, event } = req.body;

    // Slack URL Verification Challenge
    if (type === 'url_verification') {
      return res.status(200).send(req.body.challenge);
    }

    if (event && event.type === 'message' && !event.bot_id) {
      const scrubbedPayload = {
        type: event.type,
        user: event.user,
        text: event.text,
        channel: event.channel,
        ts: event.ts,
        thread_ts: event.thread_ts
      };

      const graphData = await contextProcessor.extractEntities('slack', scrubbedPayload);
      await graphService.upsertGraph(graphData);
    }

    res.status(200).send('Processed');
  } catch (error) {
    console.error('Slack Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// JIRA WEBHOOK
router.post('/jira', async (req, res) => {
  try {
    const { webhookEvent, issue, comment } = req.body;

    const scrubbedPayload: any = {
      event: webhookEvent
    };

    if (issue) {
      scrubbedPayload.issue = {
        key: issue.key,
        id: issue.id,
        summary: issue.fields?.summary,
        description: issue.fields?.description,
        status: issue.fields?.status?.name,
        assignee: issue.fields?.assignee?.accountId,
        reporter: issue.fields?.reporter?.accountId,
        priority: issue.fields?.priority?.name
      };
    }

    if (comment) {
      scrubbedPayload.comment = {
        id: comment.id,
        body: comment.body,
        author: comment.author?.accountId
      };
    }

    const graphData = await contextProcessor.extractEntities('jira', scrubbedPayload);
    await graphService.upsertGraph(graphData);

    res.status(200).send('Processed');
  } catch (error) {
    console.error('Jira Webhook Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

export default router;
