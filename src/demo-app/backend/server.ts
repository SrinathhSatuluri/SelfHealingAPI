import express, { Application } from 'express';
import { handleSignupV1 } from './routes/signup-v1';
import { SelfHealingMiddleware } from '../../packages/sdk/node/middleware';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Initialize detection middleware
const selfHealingMiddleware = new SelfHealingMiddleware({
  errorRateThreshold: 0.2, // Alert when 20% error rate
  successRateThreshold: 0.8, // Alert when success rate drops below 80%
});

// Middleware
app.use(express.json());
app.use(selfHealingMiddleware.middleware());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString()
  });
});

// Detection monitoring endpoint
app.get('/api/monitoring', (req, res) => {
  res.json({
    metrics: selfHealingMiddleware.getMetrics(),
    alerts: selfHealingMiddleware.getAlerts(),
    schemaIssues: selfHealingMiddleware.getSchemaIssues(),
    analysisResults: selfHealingMiddleware.getAnalysisResults(),
    timestamp: new Date().toISOString()
  });
});

// Signup endpoint (V1 - expects "phone" field)
app.post('/api/signup', handleSignupV1);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Self-Healing API Demo Server');
  console.log('='.repeat(60));
  console.log(`📍 Server running on: http://localhost:${PORT}`);
  console.log(`📊 Schema version: V1 (uses "phone" field)`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 Signup endpoint: POST http://localhost:${PORT}/api/signup`);
  console.log('='.repeat(60));
});

export default app;
