import { DeploymentMetrics, MetricsCollector } from './types';

/**
 * Real-time metrics collection for deployment monitoring
 * Follows Datadog agent pattern
 */
export class DeploymentMetricsCollector implements MetricsCollector {
  private endpointMetrics: Map<string, EndpointMetrics> = new Map();
  private baselines: Map<string, DeploymentMetrics> = new Map();
  private activeCollectors: Set<string> = new Set();

  /**
   * Start collecting metrics for an endpoint
   */
  startCollection(endpoint: string): void {
    if (this.activeCollectors.has(endpoint)) {
      console.log(`📊 Metrics collection already active for ${endpoint}`);
      return;
    }

    console.log(`📊 Starting metrics collection for ${endpoint}`);

    const metrics: EndpointMetrics = {
      requests: [],
      startTime: Date.now(),
      lastCleanup: Date.now()
    };

    this.endpointMetrics.set(endpoint, metrics);
    this.activeCollectors.add(endpoint);

    // Set baseline if not exists
    if (!this.baselines.has(endpoint)) {
      // Wait a bit to establish baseline
      setTimeout(() => {
        const initialMetrics = this.calculateMetrics(endpoint, 30);
        if (initialMetrics) {
          this.setBaseline(endpoint, initialMetrics);
          console.log(`📈 Baseline established for ${endpoint}:`, initialMetrics);
        }
      }, 5000);
    }
  }

  /**
   * Stop collecting metrics for an endpoint
   */
  stopCollection(endpoint: string): void {
    console.log(`📊 Stopping metrics collection for ${endpoint}`);
    this.activeCollectors.delete(endpoint);
  }

  /**
   * Record a request for metrics calculation
   */
  recordRequest(endpoint: string, request: RequestMetric): void {
    if (!this.activeCollectors.has(endpoint)) {
      return; // Not actively collecting for this endpoint
    }

    const metrics = this.endpointMetrics.get(endpoint);
    if (!metrics) {
      return;
    }

    metrics.requests.push(request);

    // Cleanup old requests (keep last 1000 or last 5 minutes)
    const now = Date.now();
    if (now - metrics.lastCleanup > 30000) { // Cleanup every 30 seconds
      this.cleanupOldRequests(endpoint);
      metrics.lastCleanup = now;
    }
  }

  /**
   * Get current metrics for an endpoint
   */
  getMetrics(endpoint: string, windowSeconds: number = 60): DeploymentMetrics {
    const calculatedMetrics = this.calculateMetrics(endpoint, windowSeconds);

    if (!calculatedMetrics) {
      return this.getEmptyMetrics();
    }

    return calculatedMetrics;
  }

  /**
   * Get baseline metrics for comparison
   */
  getBaseline(endpoint: string): DeploymentMetrics | null {
    return this.baselines.get(endpoint) || null;
  }

  /**
   * Set baseline metrics
   */
  setBaseline(endpoint: string, metrics: DeploymentMetrics): void {
    this.baselines.set(endpoint, metrics);
  }

  /**
   * Calculate metrics from request history
   */
  private calculateMetrics(endpoint: string, windowSeconds: number): DeploymentMetrics | null {
    const metrics = this.endpointMetrics.get(endpoint);
    if (!metrics) {
      return null;
    }

    const cutoffTime = Date.now() - (windowSeconds * 1000);
    const recentRequests = metrics.requests.filter(req => req.timestamp >= cutoffTime);

    if (recentRequests.length === 0) {
      return null;
    }

    // Calculate success/error rates
    const successfulRequests = recentRequests.filter(req => req.statusCode >= 200 && req.statusCode < 400);
    const errorRequests = recentRequests.filter(req => req.statusCode >= 400);

    const successRate = successfulRequests.length / recentRequests.length;
    const errorRate = errorRequests.length / recentRequests.length;

    // Calculate latency
    const latencies = recentRequests.map(req => req.responseTime);
    const averageLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;

    // Calculate throughput
    const timeWindow = windowSeconds;
    const throughput = recentRequests.length / timeWindow;

    return {
      successRate: Math.round(successRate * 1000) / 1000, // Round to 3 decimal places
      errorRate: Math.round(errorRate * 1000) / 1000,
      latency: Math.round(averageLatency * 100) / 100, // Round to 2 decimal places
      throughput: Math.round(throughput * 100) / 100,
      timestamp: new Date().toISOString(),
      sampleSize: recentRequests.length
    };
  }

  /**
   * Clean up old request records
   */
  private cleanupOldRequests(endpoint: string): void {
    const metrics = this.endpointMetrics.get(endpoint);
    if (!metrics) {
      return;
    }

    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

    // Keep requests from last 5 minutes or last 1000 requests, whichever is larger
    const timeFiltered = metrics.requests.filter(req => req.timestamp >= fiveMinutesAgo);
    const finalRequests = timeFiltered.length > 1000
      ? timeFiltered.slice(-1000)
      : timeFiltered;

    metrics.requests = finalRequests;

    if (finalRequests.length < metrics.requests.length) {
      console.log(`🧹 Cleaned up ${metrics.requests.length - finalRequests.length} old requests for ${endpoint}`);
    }
  }

  /**
   * Get empty metrics structure
   */
  private getEmptyMetrics(): DeploymentMetrics {
    return {
      successRate: 0,
      errorRate: 0,
      latency: 0,
      throughput: 0,
      timestamp: new Date().toISOString(),
      sampleSize: 0
    };
  }

  /**
   * Compare current metrics with baseline
   */
  compareWithBaseline(endpoint: string, currentMetrics: DeploymentMetrics): MetricsComparison {
    const baseline = this.getBaseline(endpoint);

    if (!baseline) {
      return {
        hasBaseline: false,
        successRateChange: 0,
        errorRateChange: 0,
        latencyChange: 0,
        throughputChange: 0
      };
    }

    return {
      hasBaseline: true,
      successRateChange: currentMetrics.successRate - baseline.successRate,
      errorRateChange: currentMetrics.errorRate - baseline.errorRate,
      latencyChange: (currentMetrics.latency - baseline.latency) / baseline.latency,
      throughputChange: (currentMetrics.throughput - baseline.throughput) / baseline.throughput
    };
  }

  /**
   * Check if metrics meet deployment thresholds
   */
  checkHealthThresholds(
    endpoint: string,
    thresholds: { successRate: number; errorRate: number; latencyIncrease: number }
  ): HealthCheck {
    const currentMetrics = this.getMetrics(endpoint);
    const comparison = this.compareWithBaseline(endpoint, currentMetrics);

    const checks = {
      successRateOk: currentMetrics.successRate >= thresholds.successRate,
      errorRateOk: currentMetrics.errorRate <= thresholds.errorRate,
      latencyOk: !comparison.hasBaseline || comparison.latencyChange <= thresholds.latencyIncrease,
      sampleSizeOk: currentMetrics.sampleSize >= 10 // Need minimum sample size
    };

    const healthy = Object.values(checks).every(Boolean);

    return {
      healthy,
      checks,
      metrics: currentMetrics,
      comparison,
      issues: !healthy ? this.identifyIssues(checks, comparison) : []
    };
  }

  /**
   * Identify specific issues with metrics
   */
  private identifyIssues(checks: any, comparison: MetricsComparison): string[] {
    const issues: string[] = [];

    if (!checks.successRateOk) {
      issues.push(`Success rate too low: ${(comparison.successRateChange * 100).toFixed(1)}% below threshold`);
    }
    if (!checks.errorRateOk) {
      issues.push(`Error rate too high: ${(comparison.errorRateChange * 100).toFixed(1)}% above threshold`);
    }
    if (!checks.latencyOk) {
      issues.push(`Latency increased by ${(comparison.latencyChange * 100).toFixed(1)}%`);
    }
    if (!checks.sampleSizeOk) {
      issues.push('Insufficient sample size for reliable metrics');
    }

    return issues;
  }

  /**
   * Get metrics history for dashboard
   */
  getMetricsHistory(endpoint: string, minutes: number = 10): DeploymentMetrics[] {
    const history: DeploymentMetrics[] = [];
    const intervals = Math.min(minutes, 10); // Max 10 data points

    for (let i = intervals; i > 0; i--) {
      const windowStart = i * 60; // i minutes ago
      const metrics = this.calculateMetrics(endpoint, 60); // 1 minute windows

      if (metrics) {
        history.push({
          ...metrics,
          timestamp: new Date(Date.now() - (windowStart * 1000)).toISOString()
        });
      }
    }

    return history;
  }
}

interface EndpointMetrics {
  requests: RequestMetric[];
  startTime: number;
  lastCleanup: number;
}

interface RequestMetric {
  timestamp: number;
  statusCode: number;
  responseTime: number;
  path: string;
}

interface MetricsComparison {
  hasBaseline: boolean;
  successRateChange: number;
  errorRateChange: number;
  latencyChange: number;
  throughputChange: number;
}

interface HealthCheck {
  healthy: boolean;
  checks: {
    successRateOk: boolean;
    errorRateOk: boolean;
    latencyOk: boolean;
    sampleSizeOk: boolean;
  };
  metrics: DeploymentMetrics;
  comparison: MetricsComparison;
  issues: string[];
}

/**
 * Create middleware to automatically record metrics
 */
export function createMetricsMiddleware(collector: DeploymentMetricsCollector) {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();

    // Capture response
    const originalSend = res.send;
    res.send = function(body: any) {
      const responseTime = Date.now() - startTime;

      collector.recordRequest(req.path, {
        timestamp: Date.now(),
        statusCode: res.statusCode,
        responseTime,
        path: req.path
      });

      return originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Factory function for common configurations
 */
export function createMetricsCollector(): DeploymentMetricsCollector {
  return new DeploymentMetricsCollector();
}