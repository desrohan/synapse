# Cron Setup for Synapse Backend

## Problem
The backend sleeps on Render.com and takes 40-50 seconds to cold start, causing scheduled reports to fail.

## Solution Options

### Option 1: Free External Cron Service (Recommended)

Use a free cron service like [Cron-job.org](https://cron-job.org/) or [EasyCron](https://www.easycron.com/):

1. **Sign up** for a free account
2. **Create a new cron job** with these settings:
   - **URL**: `https://your-render-app.onrender.com/api/cron/reports`
   - **Method**: `POST`
   - **Headers**: 
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     Content-Type: application/json
     ```
   - **Schedule**: `* * * * *` (every minute)
   - **Timeout**: 60 seconds

3. **Generate a CRON_SECRET** in your environment:
   ```bash
   # Add to your .env file
   CRON_SECRET=your-very-secure-random-string-here
   ```

### Option 2: UptimeRobot (Keep Awake + Cron)

Use UptimeRobot to keep the awake and trigger reports:

1. **Sign up** for UptimeRobot
2. **Create a new monitor**:
   - **URL**: `https://your-render-app.onrender.com/health`
   - **Check every**: 5 minutes
   - **Alert contacts**: None (just to keep awake)

3. **Create a separate cron job** (as in Option 1) for reports

### Option 3: Supabase Cron (Pro Required)

If you have Supabase Pro:

```sql
-- Create the function
CREATE OR REPLACE FUNCTION trigger_reports()
RETURNS void AS $$
DECLARE
  response TEXT;
BEGIN
  -- Make HTTP request to backend
  SELECT INTO response
    http_get(
      'https://your-render-app.onrender.com/api/cron/reports',
      'Authorization: Bearer YOUR_CRON_SECRET'
    );
  RAISE NOTICE 'Cron triggered: %', response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule it to run every minute
SELECT cron.schedule('report-cron', '* * * * *', 'SELECT trigger_reports()');
```

## Testing the Setup

1. **Set the cron secret**:
   ```bash
   echo "CRON_SECRET=your-secret-here" >> .env
   ```

2. **Test the endpoint locally**:
   ```bash
   curl -X POST http://localhost:3002/api/cron/reports \
     -H "Authorization: Bearer your-secret-here"
   ```

3. **Check logs** for successful execution

## Environment Variables Needed

Add to your backend environment:
```env
CRON_SECRET=your-very-secure-random-string-here
FRONTEND_URL=https://your-frontend-url.com
```

## Verification

After setting up, check:
1. **Backend logs** for successful cron calls
2. **Database** for new reports in `reports` table
3. **Slack** for delivered reports (if configured)
4. **Knowledge graph** for new nodes/edges from webhooks