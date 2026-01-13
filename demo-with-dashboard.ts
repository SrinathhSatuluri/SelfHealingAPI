/**
 * Self-Healing Demo with Persistent Dashboard
 * Run with: npx ts-node demo-with-dashboard.ts
 */

import express from 'express';
import axios from 'axios';
import { SelfHealingDeployer, createSelfHealingSystem } from './src/packages/deployer';
import { analyzeAPIFailure, createAnalysisInput } from './src/packages/analyzer';
import { generateFixCode } from './src/packages/healer';

// Create demo Express app
const app = express();
app.use(express.json());

// Original V1 signup endpoint (expects "phone")
app.post('/api/signup', (req, res) => {
  console.log('📝 V1 Signup request:', req.body);

  if (!req.body.name || !req.body.email || !req.body.phone || !req.body.password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: name, email, phone, password',
      details: { receivedFields: Object.keys(req.body) }
    });
  }

  res.status(201).json({
    success: true,
    userId: `user_${Date.now()}`,
    message: 'User created successfully'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Simple dashboard HTML page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Self-Healing API Dashboard</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
            .card { background: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { display: inline-block; padding: 5px 10px; border-radius: 20px; color: white; font-size: 12px; }
            .success { background: #27ae60; }
            .error { background: #e74c3c; }
            .warning { background: #f39c12; }
            .info { background: #3498db; }
            pre { background: #2c3e50; color: white; padding: 15px; border-radius: 5px; overflow-x: auto; }
            button { background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin: 5px; }
            button:hover { background: #2980b9; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .endpoint { margin: 10px 0; padding: 10px; background: #ecf0f1; border-radius: 5px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚀 Self-Healing API Dashboard</h1>
                <p>Real-time monitoring and control panel</p>
            </div>

            <div class="grid">
                <div class="card">
                    <h2>📊 API Endpoints</h2>
                    <div class="endpoint">
                        <strong>GET /api/dashboard</strong><br>
                        Complete dashboard data
                        <button onclick="fetchEndpoint('/api/dashboard')">Test</button>
                    </div>
                    <div class="endpoint">
                        <strong>GET /api/dashboard/timeline</strong><br>
                        Healing timeline events
                        <button onclick="fetchEndpoint('/api/dashboard/timeline')">Test</button>
                    </div>
                    <div class="endpoint">
                        <strong>GET /api/dashboard/metrics</strong><br>
                        Performance metrics
                        <button onclick="fetchEndpoint('/api/dashboard/metrics')">Test</button>
                    </div>
                    <div class="endpoint">
                        <strong>GET /api/dashboard/alerts</strong><br>
                        System alerts
                        <button onclick="fetchEndpoint('/api/dashboard/alerts')">Test</button>
                    </div>
                </div>

                <div class="card">
                    <h2>🎯 Test API</h2>
                    <p>Test the signup endpoint:</p>
                    <button onclick="testSignup('v1')">Test V1 (phone)</button>
                    <button onclick="testSignup('v2')">Test V2 (phoneNumber)</button>
                    <button onclick="runDemo()">Run Full Demo</button>
                </div>
            </div>

            <div class="card">
                <h2>📋 API Response</h2>
                <pre id="output">Click any endpoint above to see the response...</pre>
            </div>
        </div>

        <script>
            async function fetchEndpoint(path) {
                try {
                    const response = await fetch(path);
                    const data = await response.json();
                    document.getElementById('output').textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    document.getElementById('output').textContent = 'Error: ' + error.message;
                }
            }

            async function testSignup(version) {
                try {
                    const payload = version === 'v1' ? {
                        name: 'Test User',
                        email: 'test@example.com',
                        phone: '+1-555-0123',
                        password: 'password123'
                    } : {
                        name: 'Test User',
                        email: 'test@example.com',
                        phoneNumber: '+1-555-0123',
                        password: 'password123'
                    };

                    const response = await fetch('/api/signup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();
                    document.getElementById('output').textContent =
                        'Status: ' + response.status + '\\n\\n' +
                        'Request: ' + JSON.stringify(payload, null, 2) + '\\n\\n' +
                        'Response: ' + JSON.stringify(data, null, 2);
                } catch (error) {
                    document.getElementById('output').textContent = 'Error: ' + error.message;
                }
            }

            async function runDemo() {
                document.getElementById('output').textContent = 'Running demo... Check console for progress.';

                try {
                    const response = await fetch('/run-demo', { method: 'POST' });
                    const data = await response.json();
                    document.getElementById('output').textContent = JSON.stringify(data, null, 2);
                } catch (error) {
                    document.getElementById('output').textContent = 'Demo endpoint not implemented yet.\\nRun: npx ts-node test-phase5-complete.ts in terminal.';
                }
            }
        </script>
    </body>
    </html>
  `);
});

async function runPersistentDemo() {
  const port = 3000;

  // Start server
  const server = app.listen(port, () => {
    console.log('🌐 Self-Healing API Dashboard running!');
    console.log('================================================================================');
    console.log(`📊 Dashboard: http://localhost:${port}`);
    console.log(`🔧 API Endpoints:`);
    console.log(`   GET  http://localhost:${port}/api/dashboard`);
    console.log(`   GET  http://localhost:${port}/api/dashboard/timeline`);
    console.log(`   GET  http://localhost:${port}/api/dashboard/metrics`);
    console.log(`   GET  http://localhost:${port}/api/dashboard/alerts`);
    console.log(`   POST http://localhost:${port}/api/signup`);
    console.log('================================================================================');
    console.log('');
    console.log('🚀 Initialize self-healing system...');
  });

  try {
    // Initialize self-healing system
    const deployer = createSelfHealingSystem(app, 'demo');

    // Wait for initialization
    await sleep(2000);

    console.log('✅ Self-healing system ready!');
    console.log('💡 Try the following:');
    console.log('   1. Visit http://localhost:3000 for interactive dashboard');
    console.log('   2. Test V1 signup (should work)');
    console.log('   3. Test V2 signup (will fail - demonstrates schema mismatch)');
    console.log('   4. Check /api/dashboard endpoints for metrics');
    console.log('');
    console.log('🔄 Server will run indefinitely. Press Ctrl+C to stop.');

  } catch (error) {
    console.error('❌ Demo setup failed:', error instanceof Error ? error.message : String(error));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the persistent demo
if (require.main === module) {
  runPersistentDemo().catch(console.error);
}