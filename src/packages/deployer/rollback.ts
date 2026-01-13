import { MiddlewareInjector } from './injector';
import { CanaryDeployer } from './canary';
import { DeploymentMetricsCollector } from './metrics';
import { RollbackPlan, DeploymentStatus } from './types';
import { randomUUID } from 'crypto';

/**
 * Automated rollback system with circuit breaker pattern
 * Monitors deployments and triggers rollbacks on failure
 */
export class AutoRollbackManager {
  private injector: MiddlewareInjector;
  private canaryDeployer: CanaryDeployer;
  private metricsCollector: DeploymentMetricsCollector;
  private monitors: Map<string, RollbackMonitor> = new Map();
  private rollbackHistory: RollbackRecord[] = [];

  constructor(
    injector: MiddlewareInjector,
    canaryDeployer: CanaryDeployer,
    metricsCollector: DeploymentMetricsCollector
  ) {
    this.injector = injector;
    this.canaryDeployer = canaryDeployer;
    this.metricsCollector = metricsCollector;
  }

  /**
   * Start monitoring deployment for auto-rollback
   */
  startMonitoring(
    deploymentId: string,
    rollbackPlan: RollbackPlan
  ): void {
    console.log(`🔍 Starting rollback monitoring for deployment: ${deploymentId}`);

    const monitor: RollbackMonitor = {
      id: randomUUID(),
      deploymentId,
      rollbackPlan,
      startTime: Date.now(),
      active: true,
      checks: 0,
      lastCheck: 0,
      violations: []
    };

    this.monitors.set(deploymentId, monitor);

    // Start monitoring loop
    this.monitorDeployment(deploymentId);
  }

  /**
   * Stop monitoring deployment
   */
  stopMonitoring(deploymentId: string): void {
    const monitor = this.monitors.get(deploymentId);
    if (monitor) {
      monitor.active = false;
      this.monitors.delete(deploymentId);
      console.log(`✅ Stopped monitoring deployment: ${deploymentId}`);
    }
  }

  /**
   * Manually trigger rollback
   */
  async manualRollback(
    deploymentId: string,
    reason: string = 'Manual rollback requested'
  ): Promise<void> {
    console.log(`🔄 Manual rollback triggered for ${deploymentId}: ${reason}`);

    const monitor = this.monitors.get(deploymentId);
    if (!monitor) {
      throw new Error(`No monitor found for deployment: ${deploymentId}`);
    }

    await this.executeRollback(deploymentId, 'manual', reason);
  }

  /**
   * Main monitoring loop
   */
  private async monitorDeployment(deploymentId: string): Promise<void> {
    const monitor = this.monitors.get(deploymentId);
    if (!monitor || !monitor.active) {
      return;
    }

    const checkInterval = 5000; // Check every 5 seconds

    const monitorLoop = setInterval(async () => {
      const currentMonitor = this.monitors.get(deploymentId);

      if (!currentMonitor || !currentMonitor.active) {
        clearInterval(monitorLoop);
        return;
      }

      try {
        await this.performHealthCheck(deploymentId);
      } catch (error) {
        console.error(`❌ Health check failed for ${deploymentId}:`, error instanceof Error ? error.message : String(error));

        // Trigger rollback on health check failure
        await this.executeRollback(
          deploymentId,
          'automatic',
          `Health check failed: ${error instanceof Error ? error.message : String(error)}`
        );

        clearInterval(monitorLoop);
      }
    }, checkInterval);

    // Safety timeout - stop monitoring after 30 minutes
    setTimeout(() => {
      clearInterval(monitorLoop);
      this.stopMonitoring(deploymentId);
      console.log(`⏰ Monitoring timeout for deployment: ${deploymentId}`);
    }, 30 * 60 * 1000);
  }

  /**
   * Perform health check and evaluate rollback triggers
   */
  private async performHealthCheck(deploymentId: string): Promise<void> {
    const monitor = this.monitors.get(deploymentId);
    if (!monitor) return;

    monitor.checks++;
    monitor.lastCheck = Date.now();

    // Get deployment status
    const deploymentStatus = this.canaryDeployer.getDeploymentStatus(deploymentId);
    if (!deploymentStatus) {
      throw new Error('Deployment status not found');
    }

    // Skip health checks for completed deployments
    if (deploymentStatus.stage === 'completed' || deploymentStatus.stage === 'failed') {
      this.stopMonitoring(deploymentId);
      return;
    }

    // Get current metrics
    const deployment = this.canaryDeployer.getDeploymentStatus(deploymentId);
    if (!deployment) return;

    // Find the target endpoint from deployment
    const endpoint = this.extractEndpointFromDeployment(deployment);
    const currentMetrics = this.metricsCollector.getMetrics(endpoint, 30);

    console.log(`🔍 Health check ${monitor.checks} for ${deploymentId}:`);
    console.log(`   Success: ${(currentMetrics.successRate * 100).toFixed(1)}% | Errors: ${(currentMetrics.errorRate * 100).toFixed(1)}% | Latency: ${currentMetrics.latency.toFixed(0)}ms`);

    // Evaluate rollback triggers
    const violations = this.evaluateRollbackTriggers(deploymentId, currentMetrics, deployment);

    if (violations.length > 0) {
      monitor.violations.push(...violations);

      // Check if we need to rollback
      const shouldRollback = this.shouldTriggerRollback(monitor, violations);

      if (shouldRollback) {
        const reason = `Rollback triggered: ${violations.map(v => v.reason).join(', ')}`;
        await this.executeRollback(deploymentId, 'automatic', reason);
      }
    }
  }

  /**
   * Evaluate rollback triggers
   */
  private evaluateRollbackTriggers(
    deploymentId: string,
    currentMetrics: any,
    deploymentStatus: DeploymentStatus
  ): RollbackViolation[] {
    const violations: RollbackViolation[] = [];
    const monitor = this.monitors.get(deploymentId);

    if (!monitor) return violations;

    const triggers = monitor.rollbackPlan.triggers;

    if (!triggers) return violations;

    for (const trigger of triggers) {
      let violated = false;
      let currentValue = 0;

      switch (trigger.metric) {
        case 'error-rate':
          currentValue = currentMetrics.errorRate;
          violated = currentValue > trigger.threshold;
          break;

        case 'success-rate':
          currentValue = currentMetrics.successRate;
          violated = currentValue < trigger.threshold;
          break;

        case 'response-time':
          currentValue = currentMetrics.latency;
          violated = currentValue > trigger.threshold;
          break;
      }

      if (violated) {
        violations.push({
          timestamp: Date.now(),
          trigger,
          currentValue,
          reason: `${trigger.metric} threshold violated: ${currentValue} vs ${trigger.threshold}`
        });
      }
    }

    return violations;
  }

  /**
   * Determine if rollback should be triggered
   */
  private shouldTriggerRollback(
    monitor: RollbackMonitor,
    violations: RollbackViolation[]
  ): boolean {
    // Immediate rollback for critical violations
    const criticalViolations = violations.filter(v =>
      (v.trigger.metric === 'error-rate' && v.currentValue > 0.5) ||
      (v.trigger.metric === 'success-rate' && v.currentValue < 0.5)
    );

    if (criticalViolations.length > 0) {
      console.log(`🚨 Critical violations detected, triggering immediate rollback`);
      return true;
    }

    // Check for sustained violations
    const recentViolations = monitor.violations.filter(
      v => Date.now() - v.timestamp < 60000 // Last minute
    );

    const sustainedViolations = violations.filter(v => {
      const similar = recentViolations.filter(rv => rv.trigger.metric === v.trigger.metric);
      return similar.length >= 3; // 3 consecutive violations
    });

    if (sustainedViolations.length > 0) {
      console.log(`⚠️ Sustained violations detected, triggering rollback`);
      return true;
    }

    return false;
  }

  /**
   * Execute rollback process
   */
  private async executeRollback(
    deploymentId: string,
    trigger: 'manual' | 'automatic',
    reason: string
  ): Promise<void> {
    const monitor = this.monitors.get(deploymentId);
    if (!monitor) {
      throw new Error(`No monitor found for deployment: ${deploymentId}`);
    }

    console.log(`🔄 Executing rollback for ${deploymentId}:`);
    console.log(`   Trigger: ${trigger}`);
    console.log(`   Reason: ${reason}`);

    const rollbackId = randomUUID();
    const startTime = Date.now();

    try {
      // Stop monitoring first
      monitor.active = false;

      // Execute rollback based on strategy
      if (monitor.rollbackPlan.strategy === 'immediate') {
        await this.immediateRollback(deploymentId);
      } else {
        await this.gradualRollback(deploymentId);
      }

      // Record rollback
      const record: RollbackRecord = {
        id: rollbackId,
        deploymentId,
        trigger,
        reason,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: true,
        strategy: monitor.rollbackPlan.strategy
      };

      this.rollbackHistory.push(record);

      // Clean up monitoring
      this.monitors.delete(deploymentId);

      console.log(`✅ Rollback completed successfully in ${Date.now() - startTime}ms`);

    } catch (error) {
      console.error(`❌ Rollback failed: ${error instanceof Error ? error.message : String(error)}`);

      // Record failed rollback
      const record: RollbackRecord = {
        id: rollbackId,
        deploymentId,
        trigger,
        reason,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        strategy: monitor.rollbackPlan.strategy
      };

      this.rollbackHistory.push(record);
      throw error;
    }
  }

  /**
   * Immediate rollback - instant traffic removal
   */
  private async immediateRollback(deploymentId: string): Promise<void> {
    console.log(`⚡ Performing immediate rollback for ${deploymentId}`);

    // Use canary deployer's rollback function
    await this.canaryDeployer.rollbackDeployment(deploymentId, 'automatic');
  }

  /**
   * Gradual rollback - step down traffic
   */
  private async gradualRollback(deploymentId: string): Promise<void> {
    console.log(`🌊 Performing gradual rollback for ${deploymentId}`);

    // For now, use immediate rollback
    // In production, you might want to:
    // 1. Reduce traffic to 50% for 30 seconds
    // 2. Reduce to 25% for 30 seconds
    // 3. Reduce to 0%

    await this.immediateRollback(deploymentId);
  }

  /**
   * Extract endpoint from deployment status
   */
  private extractEndpointFromDeployment(deployment: DeploymentStatus): string {
    // For now, assume it's from the deployment ID or default
    // In a real system, you'd have this in the deployment metadata
    return '/api/signup'; // Default for our demo
  }

  /**
   * Get rollback history
   */
  getRollbackHistory(limit: number = 20): RollbackRecord[] {
    return this.rollbackHistory
      .slice(-limit)
      .reverse(); // Most recent first
  }

  /**
   * Get active monitors
   */
  getActiveMonitors(): RollbackMonitor[] {
    return Array.from(this.monitors.values()).filter(m => m.active);
  }

  /**
   * Get monitor status
   */
  getMonitorStatus(deploymentId: string): RollbackMonitor | null {
    return this.monitors.get(deploymentId) || null;
  }

  /**
   * Emergency rollback all deployments
   */
  async emergencyRollbackAll(reason: string = 'Emergency rollback - all deployments'): Promise<void> {
    console.log(`🚨 EMERGENCY ROLLBACK: Rolling back all active deployments`);
    console.log(`🚨 Reason: ${reason}`);

    const activeDeployments = this.canaryDeployer.getActiveDeployments();
    const rollbackPromises = activeDeployments
      .filter(d => d.stage !== 'completed' && d.stage !== 'failed')
      .map(deployment =>
        this.canaryDeployer.rollbackDeployment(deployment.id, 'automatic')
      );

    await Promise.allSettled(rollbackPromises);

    // Also disable all injected middleware
    await this.injector.emergencyStop();

    console.log(`🛑 Emergency rollback completed for ${rollbackPromises.length} deployments`);
  }

  /**
   * Circuit breaker - monitor overall system health
   */
  enableCircuitBreaker(
    endpoint: string,
    thresholds: { errorRate: number; duration: number }
  ): void {
    console.log(`🔌 Enabling circuit breaker for ${endpoint}`);

    const checkInterval = 10000; // Check every 10 seconds

    const circuitBreakerCheck = setInterval(() => {
      const metrics = this.metricsCollector.getMetrics(endpoint, thresholds.duration);

      if (metrics.errorRate > thresholds.errorRate && metrics.sampleSize > 10) {
        console.log(`🚨 CIRCUIT BREAKER TRIGGERED for ${endpoint}`);
        console.log(`   Error rate: ${(metrics.errorRate * 100).toFixed(1)}% (threshold: ${(thresholds.errorRate * 100).toFixed(1)}%)`);

        // Trigger emergency rollback
        this.emergencyRollbackAll(`Circuit breaker triggered - error rate ${(metrics.errorRate * 100).toFixed(1)}%`);

        clearInterval(circuitBreakerCheck);
      }
    }, checkInterval);

    // Auto-disable after 1 hour
    setTimeout(() => {
      clearInterval(circuitBreakerCheck);
      console.log(`🔌 Circuit breaker disabled for ${endpoint} (timeout)`);
    }, 60 * 60 * 1000);
  }
}

interface RollbackMonitor {
  id: string;
  deploymentId: string;
  rollbackPlan: RollbackPlan;
  startTime: number;
  active: boolean;
  checks: number;
  lastCheck: number;
  violations: RollbackViolation[];
}

interface RollbackViolation {
  timestamp: number;
  trigger: any;
  currentValue: number;
  reason: string;
}

interface RollbackRecord {
  id: string;
  deploymentId: string;
  trigger: 'manual' | 'automatic';
  reason: string;
  startTime: string;
  endTime: string;
  duration: number;
  success: boolean;
  error?: string;
  strategy: 'immediate' | 'gradual';
}

/**
 * Factory function for creating rollback manager
 */
export function createRollbackManager(
  injector: MiddlewareInjector,
  canaryDeployer: CanaryDeployer,
  metricsCollector: DeploymentMetricsCollector
): AutoRollbackManager {
  return new AutoRollbackManager(injector, canaryDeployer, metricsCollector);
}