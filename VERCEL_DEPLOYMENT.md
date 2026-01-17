# Vercel Deployment Guide

## Quick Deploy

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```
   Follow the prompts to link your project.

3. **Production Deploy**:
   ```bash
   npm run deploy
   ```

## Environment Variables

Set these in your Vercel dashboard:

- `ANTHROPIC_API_KEY` - Your Claude API key (for LLM features)
- `OPENAI_API_KEY` - Your OpenAI API key (alternative to Claude)
- `NODE_ENV` - Set to `production`

## API Endpoints

Your deployed API will have these endpoints:

- `GET /` - API information
- `GET /health` - Health check
- `POST /api/signup` - User signup (expects: email, password, phone, name)
- `GET /api/monitoring` - Mock monitoring data

## Local Development with Vercel

```bash
npm run vercel-dev
```

This runs your API locally using Vercel's development environment.

## Project Structure Changes

- **Original**: Express server in `src/demo-app/backend/`
- **Vercel**: Serverless functions in `api/` directory
- **Configuration**: `vercel.json` handles routing and builds

## Limitations on Vercel

1. **Stateless Functions**: In-memory state doesn't persist between requests
2. **Cold Starts**: Functions may have initial delay
3. **Timeout**: 30-second execution limit for serverless functions
4. **No Background Processes**: Continuous monitoring features are limited

## Features Available

✅ API endpoints and validation
✅ Health checks
✅ Basic monitoring data (mocked)
✅ Signup functionality

⚠️ Limited: Self-healing features (require persistent state)
⚠️ Limited: Real-time monitoring (serverless constraints)

## Demo Usage

After deployment, test your API:

```bash
# Health check
curl https://your-app.vercel.app/health

# Signup test
curl -X POST https://your-app.vercel.app/api/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password","phone":"+1234567890","name":"Test User"}'

# Monitoring data
curl https://your-app.vercel.app/api/monitoring
```

## Next Steps

For full self-healing capabilities, consider:
- Using Vercel's Edge Config for persistent state
- Implementing webhooks for real-time monitoring
- Using external databases for metrics storage