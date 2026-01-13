import axios from 'axios';

/**
 * Traffic Generator for testing self-healing API detection
 * Generates realistic traffic patterns to trigger alerts
 */
export class TrafficGenerator {
  private baseUrl: string;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generate V1 traffic (uses "phone" field)
   */
  async sendV1Request(): Promise<{ success: boolean; response?: any; error?: string }> {
    try {
      const payload = {
        name: this.generateRandomName(),
        email: this.generateRandomEmail(),
        phone: this.generateRandomPhone(),
        password: 'password123'
      };

      const response = await axios.post(`${this.baseUrl}/api/signup`, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      return { success: true, response: response.data };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Generate V2 traffic (uses "phoneNumber" field)
   */
  async sendV2Request(): Promise<{ success: boolean; response?: any; error?: string }> {
    try {
      const payload = {
        name: this.generateRandomName(),
        email: this.generateRandomEmail(),
        phoneNumber: this.generateRandomPhone(), // V2 uses phoneNumber
        password: 'password123'
      };

      const response = await axios.post(`${this.baseUrl}/api/signup`, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });

      return { success: true, response: response.data };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Start continuous traffic generation
   */
  startTraffic(config: {
    requestsPerMinute?: number;
    v1Percentage?: number; // 0-100, percentage of V1 requests
    duration?: number; // minutes, 0 = infinite
  } = {}) {
    const {
      requestsPerMinute = 30,
      v1Percentage = 100,
      duration = 0
    } = config;

    if (this.isRunning) {
      console.log('Traffic generation already running');
      return;
    }

    this.isRunning = true;
    const intervalMs = (60 / requestsPerMinute) * 1000;

    console.log(`🚦 Starting traffic generation:`);
    console.log(`   Rate: ${requestsPerMinute} requests/minute`);
    console.log(`   V1 percentage: ${v1Percentage}%`);
    console.log(`   Duration: ${duration === 0 ? 'infinite' : `${duration} minutes`}`);

    let requestCount = 0;
    let successCount = 0;
    let errorCount = 0;

    this.intervalId = setInterval(async () => {
      const useV1 = Math.random() * 100 < v1Percentage;
      const result = useV1 ? await this.sendV1Request() : await this.sendV2Request();

      requestCount++;
      if (result.success) {
        successCount++;
        console.log(`✅ Request ${requestCount} (${useV1 ? 'V1' : 'V2'}): Success`);
      } else {
        errorCount++;
        console.log(`❌ Request ${requestCount} (${useV1 ? 'V1' : 'V2'}): ${result.error}`);
      }

      // Log stats every 10 requests
      if (requestCount % 10 === 0) {
        const successRate = (successCount / requestCount * 100).toFixed(1);
        console.log(`📊 Stats: ${requestCount} total, ${successCount} success (${successRate}%), ${errorCount} errors`);
      }
    }, intervalMs);

    // Stop after duration if specified
    if (duration > 0) {
      setTimeout(() => {
        this.stopTraffic();
      }, duration * 60 * 1000);
    }
  }

  /**
   * Stop traffic generation
   */
  stopTraffic() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('🛑 Traffic generation stopped');
  }

  /**
   * Simulate breaking change scenario
   */
  async simulateBreakingChange(config: {
    warmupDuration?: number; // minutes of V1 traffic
    breakAfter?: number; // minutes after which to trigger V2
    cooldownDuration?: number; // minutes of continued V1 traffic after break
  } = {}) {
    const {
      warmupDuration = 2,
      breakAfter = 1,
      cooldownDuration = 3
    } = config;

    console.log(`🎭 Starting breaking change simulation:`);
    console.log(`   Phase 1: ${warmupDuration}min of V1 traffic (healthy baseline)`);
    console.log(`   Phase 2: ${breakAfter}min delay, then deploy V2 (breaking change)`);
    console.log(`   Phase 3: ${cooldownDuration}min of continued V1 traffic (errors)`);

    // Phase 1: Warmup with V1 traffic (should succeed)
    console.log('\n🟢 Phase 1: Generating healthy V1 traffic...');
    this.startTraffic({
      requestsPerMinute: 20,
      v1Percentage: 100,
      duration: warmupDuration
    });

    // Wait for warmup to complete
    await this.sleep(warmupDuration * 60 * 1000);

    // Phase 2: Deploy breaking change
    console.log('\\n🟡 Phase 2: Deploying breaking change...');
    try {
      await axios.post(`${this.baseUrl}/admin/simulate-deploy`);
      console.log('✅ Breaking change deployed successfully');
    } catch (error) {
      console.error('❌ Failed to deploy breaking change:', error);
      return;
    }

    // Brief pause to let deployment complete
    await this.sleep(breakAfter * 60 * 1000);

    // Phase 3: Continue V1 traffic (should start failing)
    console.log('\\n🔴 Phase 3: Continuing V1 traffic (expecting errors)...');
    this.startTraffic({
      requestsPerMinute: 20,
      v1Percentage: 100, // Keep sending V1 requests to broken V2 API
      duration: cooldownDuration
    });

    // Wait for cooldown to complete
    await this.sleep(cooldownDuration * 60 * 1000);

    console.log('\\n🏁 Breaking change simulation complete!');
    console.log('Check the alerts and schema issues endpoints for detection results.');
  }

  /**
   * Generate test data
   */
  private generateRandomName(): string {
    const first = ['John', 'Jane', 'Alex', 'Sarah', 'Mike', 'Emily', 'David', 'Lisa'];
    const last = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
    return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
  }

  private generateRandomEmail(): string {
    const domains = ['test.com', 'example.org', 'demo.net', 'sample.io'];
    const username = Math.random().toString(36).substring(2, 10);
    return `${username}@${domains[Math.floor(Math.random() * domains.length)]}`;
  }

  private generateRandomPhone(): string {
    const area = Math.floor(Math.random() * 900) + 100;
    const exchange = Math.floor(Math.random() * 900) + 100;
    const number = Math.floor(Math.random() * 9000) + 1000;
    return `${area}-${exchange}-${number}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check current API metrics
   */
  async getMetrics() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/metrics`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      return null;
    }
  }

  /**
   * Check current alerts
   */
  async getAlerts() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/alerts`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
      return null;
    }
  }

  /**
   * Check schema issues
   */
  async getSchemaIssues() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/schema-issues`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch schema issues:', error);
      return null;
    }
  }
}

// CLI interface
if (require.main === module) {
  const generator = new TrafficGenerator();

  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'simulate':
      console.log('🎬 Starting breaking change simulation...');
      generator.simulateBreakingChange();
      break;

    case 'traffic':
      const rate = parseInt(args[1]) || 30;
      const v1pct = parseInt(args[2]) || 100;
      console.log(`🚦 Starting traffic: ${rate} req/min, ${v1pct}% V1`);
      generator.startTraffic({
        requestsPerMinute: rate,
        v1Percentage: v1pct
      });
      break;

    case 'test':
      console.log('🧪 Sending test requests...');
      Promise.all([
        generator.sendV1Request(),
        generator.sendV2Request()
      ]).then(results => {
        console.log('V1 Result:', results[0]);
        console.log('V2 Result:', results[1]);
      });
      break;

    default:
      console.log('Usage:');
      console.log('  npm run traffic simulate    # Full breaking change demo');
      console.log('  npm run traffic traffic 30 100  # 30 req/min, 100% V1');
      console.log('  npm run traffic test        # Send test requests');
      break;
  }
}