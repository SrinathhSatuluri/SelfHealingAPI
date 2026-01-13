import express, { Express } from 'express';
import { handleSignupV1 } from '../demo-app/backend/routes/signup-v1';
import { handleSignupV2 } from '../demo-app/backend/routes/signup-v2';
import { SelfHealingMiddleware } from '../packages/sdk/node/middleware';

/**
 * API Simulator - Switches from V1 to V2 to simulate breaking changes
 * Simulates a backend deployment that introduces schema breaking changes
 */
export class ApiSimulator {
  private app: Express;
  private selfHealing: SelfHealingMiddleware;
  private currentVersion: 'v1' | 'v2' = 'v1';
  private server: any;

  constructor(port: number = 3001) {
    this.app = express();
    this.selfHealing = new SelfHealingMiddleware({
      errorRateThreshold: 0.05, // 5% error rate threshold
      successRateThreshold: 0.95, // 95% success rate threshold
      responseTimeThreshold: 3000,
      windowSize: '2m',
      schemaValidation: true,
      enableAlerts: true
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Self-healing detection middleware
    this.app.use(this.selfHealing.middleware());
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        version: this.currentVersion,
        timestamp: new Date().toISOString()
      });
    });

    // Version info
    this.app.get('/api/version', (req, res) => {
      res.json({
        version: this.currentVersion,
        schema: this.currentVersion === 'v1'
          ? { fields: ['email', 'password', 'phone', 'name'] }
          : { fields: ['email', 'password', 'phoneNumber', 'name'] },
        timestamp: new Date().toISOString()
      });
    });

    // Dynamic signup endpoint - switches between V1 and V2
    this.app.post('/api/signup', (req, res) => {
      if (this.currentVersion === 'v1') {
        handleSignupV1(req, res);
      } else {
        handleSignupV2(req, res);
      }
    });

    // Metrics endpoint
    this.app.get('/api/metrics', (req, res) => {
      const metrics = this.selfHealing.getMetrics();
      res.json(metrics);
    });

    // Alerts endpoint
    this.app.get('/api/alerts', (req, res) => {
      const alerts = this.selfHealing.getAlerts();
      res.json(alerts);
    });

    // Schema issues endpoint
    this.app.get('/api/schema-issues', (req, res) => {
      const issues = this.selfHealing.getSchemaIssues();
      res.json(issues);
    });

    // Admin endpoint to switch versions
    this.app.post('/admin/switch-version', (req, res) => {
      const { version } = req.body;

      if (version !== 'v1' && version !== 'v2') {
        return res.status(400).json({
          error: 'Invalid version. Must be v1 or v2'
        });
      }

      const oldVersion = this.currentVersion;
      this.currentVersion = version;

      console.log(`🔄 API Version switched: ${oldVersion} → ${this.currentVersion}`);

      res.json({
        message: `API switched from ${oldVersion} to ${this.currentVersion}`,
        oldVersion,
        newVersion: this.currentVersion,
        timestamp: new Date().toISOString()
      });
    });

    // Admin endpoint to trigger breaking change simulation
    this.app.post('/admin/simulate-deploy', (req, res) => {
      console.log('🚀 Simulating production deployment with breaking changes...');

      // Switch to V2 to simulate deployment
      setTimeout(() => {
        const oldVersion = this.currentVersion;
        this.currentVersion = 'v2';

        console.log(`📦 Deployment complete: ${oldVersion} → ${this.currentVersion}`);
        console.log('⚠️  Breaking change deployed: phone → phoneNumber');
      }, 1000);

      res.json({
        message: 'Deployment simulation started',
        deploymentTime: '1 second',
        breakingChange: 'phone field renamed to phoneNumber',
        timestamp: new Date().toISOString()
      });
    });
  }

  start(port: number = 3001): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => {
        console.log(`🚀 API Simulator running on http://localhost:${port}`);
        console.log(`📊 Metrics: http://localhost:${port}/api/metrics`);
        console.log(`🚨 Alerts: http://localhost:${port}/api/alerts`);
        console.log(`🔍 Schema Issues: http://localhost:${port}/api/schema-issues`);
        console.log(`⚙️  Current Version: ${this.currentVersion}`);
        console.log(`\n📋 Admin Commands:`);
        console.log(`   POST /admin/switch-version {"version": "v1|v2"}`);
        console.log(`   POST /admin/simulate-deploy`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('🛑 API Simulator stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getCurrentVersion(): 'v1' | 'v2' {
    return this.currentVersion;
  }

  getMetrics() {
    return this.selfHealing.getMetrics();
  }

  getAlerts() {
    return this.selfHealing.getAlerts();
  }

  getSchemaIssues() {
    return this.selfHealing.getSchemaIssues();
  }
}

// CLI interface for running simulator
if (require.main === module) {
  const simulator = new ApiSimulator();

  simulator.start(3001).then(() => {
    console.log('\n✅ Ready for demo! Try these commands:');
    console.log('1. Send V1 requests: curl -X POST http://localhost:3001/api/signup -H "Content-Type: application/json" -d \'{"name":"John","email":"john@test.com","phone":"555-1234","password":"secret"}\'');
    console.log('2. Switch to V2: curl -X POST http://localhost:3001/admin/switch-version -H "Content-Type: application/json" -d \'{"version":"v2"}\'');
    console.log('3. Send same V1 request (will fail): curl -X POST http://localhost:3001/api/signup -H "Content-Type: application/json" -d \'{"name":"John","email":"john@test.com","phone":"555-1234","password":"secret"}\'');
    console.log('4. Check alerts: curl http://localhost:3001/api/alerts');
    console.log('5. Check schema issues: curl http://localhost:3001/api/schema-issues');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down simulator...');
    await simulator.stop();
    process.exit(0);
  });
}