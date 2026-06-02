# Trigger.dev Integration Setup

## Overview
This setup replaces the external cron service with Trigger.dev's native scheduling system for more reliable and precise report generation.

## Files Created/Modified

### 1. `trigger.config.ts` (NEW)
- Initializes Trigger.dev with your project ID
- Registers the scheduled report task

### 2. `src/trigger/scheduledReport.ts` (NEW)
- Contains the actual report generation logic
- Handles data collection, AI processing, and database storage
- Replaces the old `reportRunner.ts` functionality

### 3. `src/routes/dashboard.ts` (MODIFIED)
- Updated to register schedules with Trigger.dev when users save their preferences
- Handles both enabling and disabling schedules

### 4. `package.json` (MODIFIED)
- Added Trigger.dev development and deployment scripts

## Setup Steps

### 1. Install Trigger.dev API Key
Add to your environment variables:
```env
TRIGGER_API_KEY=your_trigger_api_key_here
```

### 2. Test the Development Environment
```bash
cd apps/backend
npm run trigger:dev
```

### 3. Deploy to Trigger.dev
```bash
npm run trigger:deploy
```

### 4. Test the Dashboard Flow
1. Go to your dashboard
2. Set a schedule (e.g., 11:00 AM IST)
3. Check Trigger.dev dashboard for the registered schedule
4. Verify reports are generated at the correct time

## How It Works

### User Flow:
```
1. User sets 11:00 AM IST in dashboard
2. Dashboard API converts to UTC (05:30 UTC)
3. Dashboard API registers cron: "30 05 * * *" with Trigger.dev
4. Trigger.dev runs task at exactly 05:30 UTC daily
5. Task generates report and saves to Supabase
```

### Task Execution:
```
1. Fetch user's integrations from Supabase
2. Get MCP tools (GitHub, Jira, Slack)
3. Call Gemini API to generate report
4. Save report to `reports` table
5. Extract action items to `todos` table
6. Mark schedule as run
```

## Key Benefits

- ✅ **Precise timing** - Reports generate at exactly 11:00 AM IST
- ✅ **Built-in retries** - If Gemini API fails, Trigger.dev retries automatically
- ✅ **Full observability** - See all runs, logs, and errors in Trigger.dev dashboard
- ✅ **No external cron service needed** - Native Trigger.dev scheduling
- ✅ **Cold start proof** - Trigger.dev workers are always running

## Environment Variables Needed

```env
# Existing
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
GEMINI_API_KEY=your_gemini_api_key

# New
TRIGGER_API_KEY=your_trigger_api_key_here
```

## Testing

### Test Report Generation Manually:
```bash
# Trigger a test run for a specific user
curl -X POST http://localhost:3002/api/dashboard/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "schedule_type": "daily",
    "enabled": true,
    "time_utc": "14:00"
  }'
```

### Check Results:
1. Trigger.dev dashboard for task runs
2. Supabase `reports` table for generated reports
3. Supabase `todos` table for extracted action items

## Troubleshooting

### Common Issues:
1. **Task not running**: Check Trigger.dev dashboard for errors
2. **Authentication failed**: Verify `TRIGGER_API_KEY` is correct
3. **Database errors**: Check Supabase connection and permissions
4. **Gemini API errors**: Verify `GEMINI_API_KEY` and quota limits

### Debug Commands:
```bash
# Check Trigger.dev status
npm run trigger:dev

# View logs in Trigger.dev dashboard
# Check Supabase data directly
# Test MCP tools manually
```