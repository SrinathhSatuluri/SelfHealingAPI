import { DeploymentMetricsCollector } from './metrics';
import {
  CanaryStage,
  DeploymentPlan,
  DeploymentStatus,
  DeploymentEvent,
  FeatureFlag,
  DeploymentResult,
  MiddlewareDefinition
} from './types';
import { randomUUID } from 'crypto';

/**
 * Canary deployment system with percentage-based rollouts
 * Follows Flagsmith/Unleash pattern for gradual deployment
 */
export class CanaryDeployer {
  private deployments: Map<string, ActiveDeployment> = new Map();
  private metricsCollector: DeploymentMetricsCollector;
  private featureFlags: Map<string, FeatureFlag> = new Map();

  constructor(metricsCollector: DeploymentMetricsCollector) {
    this.metricsCollector = metricsCollector;
  }

  /**
   * Start a canary deployment
   */
  async deployCanary(
    middleware: MiddlewareDefinition,
    plan?: Partial<DeploymentPlan>
  ): Promise<string> {
    const deploymentId = randomUUID();

    console.log(`🚀 Starting canary deployment: ${deploymentId}`);
    console.log(`📋 Middleware: ${middleware.name} for ${middleware.targetEndpoint}`);

    // Create deployment plan
    const fullPlan = this.createDeploymentPlan(deploymentId, middleware.id, plan);

    // Initialize deployment status
    const status: DeploymentStatus = {
      id: deploymentId,
      stage: 'planning',
      currentStage: -1,
      trafficPercentage: 0,
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      metrics: {
        baseline: this.metricsCollector.getBaseline(middleware.targetEndpoint) || this.getEmptyMetrics(),
        current: this.getEmptyMetrics(),
        history: []
      },
      events: []
    };

    // Store active deployment
    const activeDeployment: ActiveDeployment = {
      id: deploymentId,
      middleware,
      plan: fullPlan,
      status,
      stageStartTime: 0,
      rollbackFunction: null
    };

    this.deployments.set(deploymentId, activeDeployment);

    // Add initial event
    this.addEvent(deploymentId, 'stage-start', `Deployment ${deploymentId} initiated`, { plan: fullPlan });

    // Start deployment process
    this.processDeployment(deploymentId);

    return deploymentId;
  }

  /**
   * Process deployment through stages
   */
  private async processDeployment(deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    try {
      deployment.status.stage = 'deploying';
      this.updateDeployment(deploymentId, deployment);

      // Start metrics collection
      this.metricsCollector.startCollection(deployment.middleware.targetEndpoint);

      // Process each stage
      for (let stageIndex = 0; stageIndex < deployment.plan.stages.length; stageIndex++) {
        const stage = deployment.plan.stages[stageIndex];

        console.log(`📊 Stage ${stageIndex + 1}: Deploying to ${stage.percentage}% of traffic`);

        // Deploy to this percentage
        await this.deployToPercentage(deploymentId, stage.percentage, stage);

        // Monitor stage
        const stageResult = await this.monitorStage(deploymentId, stage, stageIndex);

        if (!stageResult.success) {
          console.log(`❌ Stage ${stageIndex + 1} failed: ${stageResult.reason}`);
          await this.rollbackDeployment(deploymentId, 'automatic');
          return;
        }

        console.log(`✅ Stage ${stageIndex + 1} completed successfully`);
      }

      // Deployment completed successfully
      await this.completeDeployment(deploymentId);

    } catch (error) {
      console.error(`💥 Deployment ${deploymentId} failed:`, error instanceof Error ? error.message : String(error));
      await this.rollbackDeployment(deploymentId, 'automatic');
    }
  }

  /**
   * Deploy middleware to a specific percentage of traffic
   */
  private async deployToPercentage(
    deploymentId: string,
    percentage: number,
    stage: CanaryStage
  ): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    // Create feature flag for percentage-based routing
    const flagKey = `deployment_${deploymentId}`;
    const featureFlag: FeatureFlag = {
      key: flagKey,
      enabled: true,
      rolloutPercentage: percentage
    };

    this.featureFlags.set(flagKey, featureFlag);

    // Update deployment status
    deployment.status.currentStage = deployment.plan.stages.findIndex(s => s.percentage === percentage);
    deployment.status.trafficPercentage = percentage;
    deployment.status.stage = 'monitoring';
    deployment.stageStartTime = Date.now();

    this.updateDeployment(deploymentId, deployment);

    // Add deployment event
    this.addEvent(deploymentId, 'stage-start', `Deployed to ${percentage}% traffic`, {
      percentage,
      stage: deployment.status.currentStage
    });

    console.log(`🎯 Feature flag created: ${flagKey} at ${percentage}%`);
  }

  /**
   * Monitor a deployment stage
   */
  private async monitorStage(
    deploymentId: string,
    stage: CanaryStage,
    stageIndex: number
  ): Promise<{ success: boolean; reason?: string }> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      return { success: false, reason: 'Deployment not found' };
    }

    const endpoint = deployment.middleware.targetEndpoint;
    const monitoringDuration = stage.duration * 1000; // Convert to milliseconds
    const checkInterval = deployment.plan.monitoring.sampleFrequency * 1000;

    console.log(`📊 Monitoring stage ${stageIndex + 1} for ${stage.duration} seconds...`);

    return new Promise((resolve) => {
      let checksCompleted = 0;
      let lastCheckTime = 0;

      const monitorInterval = setInterval(async () => {
        const now = Date.now();

        // Check if monitoring period is over
        if (now - deployment.stageStartTime >= monitoringDuration) {
          clearInterval(monitorInterval);

          this.addEvent(deploymentId, 'stage-complete',
            `Stage ${stageIndex + 1} monitoring completed successfully`,
            { stage: stageIndex, checks: checksCompleted }
          );

          resolve({ success: true });
          return;
        }

        // Check if it's time for a metrics check
        if (now - lastCheckTime >= checkInterval) {
          lastCheckTime = now;
          checksCompleted++;

          // Get current metrics
          const currentMetrics = this.metricsCollector.getMetrics(endpoint, deployment.plan.monitoring.windowSize);

          // Update deployment status with current metrics
          deployment.status.metrics.current = currentMetrics;
          deployment.status.metrics.history.push(currentMetrics);

          // Keep only recent history (last 20 samples)
          if (deployment.status.metrics.history.length > 20) {
            deployment.status.metrics.history = deployment.status.metrics.history.slice(-20);
          }

          this.updateDeployment(deploymentId, deployment);

          // Check health thresholds
          const healthCheck = this.metricsCollector.checkHealthThresholds(endpoint, deployment.plan.rollbackThresholds);

          console.log(`🔍 Health check ${checksCompleted}: ${healthCheck.healthy ? 'PASS' : 'FAIL'}`);
          console.log(`   Success: ${(currentMetrics.successRate * 100).toFixed(1)}% | Errors: ${(currentMetrics.errorRate * 100).toFixed(1)}% | Latency: ${currentMetrics.latency.toFixed(0)}ms`);

          // Add metrics check event
          this.addEvent(deploymentId, 'metrics-check',
            `Health check ${checksCompleted}: ${healthCheck.healthy ? 'PASS' : 'FAIL'}`,
            { metrics: currentMetrics, healthy: healthCheck.healthy, issues: healthCheck.issues }
          );

          if (!healthCheck.healthy) {
            clearInterval(monitorInterval);

            this.addEvent(deploymentId, 'rollback',
              `Stage ${stageIndex + 1} failed health checks: ${healthCheck.issues.join(', ')}`,
              { stage: stageIndex, issues: healthCheck.issues }
            );

            resolve({
              success: false,
              reason: `Health check failed: ${healthCheck.issues.join(', ')}`
            });
            return;
          }
        }
      }, 1000); // Check every second

      // Safety timeout
      setTimeout(() => {
        clearInterval(monitorInterval);
        resolve({ success: false, reason: 'Monitoring timeout' });
      }, monitoringDuration + 10000); // 10 second buffer
    });
  }

  /**
   * Complete successful deployment
   */
  private async completeDeployment(deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    deployment.status.stage = 'completed';
    deployment.status.trafficPercentage = 100;

    this.updateDeployment(deploymentId, deployment);

    this.addEvent(deploymentId, 'stage-complete', 'Deployment completed successfully', {
      finalMetrics: deployment.status.metrics.current
    });

    console.log(`✅ Deployment ${deploymentId} completed successfully!`);

    // Stop metrics collection
    this.metricsCollector.stopCollection(deployment.middleware.targetEndpoint);
  }

  /**
   * Rollback a deployment
   */
  async rollbackDeployment(deploymentId: string, trigger: 'manual' | 'automatic'): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    console.log(`🔄 Rolling back deployment ${deploymentId} (${trigger})`);

    deployment.status.stage = 'rolling-back';
    this.updateDeployment(deploymentId, deployment);

    // Remove feature flag (disables new middleware)
    const flagKey = `deployment_${deploymentId}`;
    this.featureFlags.delete(flagKey);

    // Execute rollback function if available
    if (deployment.rollbackFunction) {
      try {
        await deployment.rollbackFunction();
      } catch (error) {
        console.error('Rollback function failed:', error instanceof Error ? error.message : String(error));
      }
    }

    deployment.status.stage = 'failed';
    deployment.status.trafficPercentage = 0;

    this.updateDeployment(deploymentId, deployment);

    this.addEvent(deploymentId, 'rollback', `Deployment rolled back (${trigger})`, {
      trigger,
      finalMetrics: deployment.status.metrics.current
    });

    console.log(`✅ Rollback completed for ${deploymentId}`);

    // Stop metrics collection
    this.metricsCollector.stopCollection(deployment.middleware.targetEndpoint);
  }

  /**
   * Check if a request should use the new middleware
   */
  shouldUseNewMiddleware(deploymentId: string, requestId?: string): boolean {
    const flagKey = `deployment_${deploymentId}`;
    const flag = this.featureFlags.get(flagKey);

    if (!flag || !flag.enabled) {
      return false;
    }

    // Simple percentage-based rollout
    // In production, you might use user ID or other stable identifier
    const randomValue = Math.random() * 100;
    return randomValue < flag.rolloutPercentage;
  }

  /**
   * Get deployment status
   */
  getDeploymentStatus(deploymentId: string): DeploymentStatus | null {
    const deployment = this.deployments.get(deploymentId);
    return deployment ? deployment.status : null;
  }

  /**
   * Get all active deployments
   */
  getActiveDeployments(): DeploymentStatus[] {
    return Array.from(this.deployments.values()).map(d => d.status);
  }

  /**
   * Create default deployment plan
   */
  private createDeploymentPlan(deploymentId: string, fixId: string, partial?: Partial<DeploymentPlan>): DeploymentPlan {
    const defaultPlan: DeploymentPlan = {
      id: deploymentId,
      fixId,
      stages: [
        { percentage: 10, duration: 30, successThreshold: 0.95, maxErrorRate: 0.05 },
        { percentage: 50, duration: 60, successThreshold: 0.95, maxErrorRate: 0.05 },
        { percentage: 100, duration: 60, successThreshold: 0.95, maxErrorRate: 0.05 }
      ],
      rollbackThresholds: {
        successRate: 0.90,
        errorRate: 0.10,
        latencyIncrease: 0.50 // 50% latency increase triggers rollback
      },
      monitoring: {
        windowSize: 30,
        sampleFrequency: 5
      }
    };

    return { ...defaultPlan, ...partial };
  }

  /**
   * Add event to deployment
   */
  private addEvent(deploymentId: string, type: DeploymentEvent['type'], message: string, data?: any): void {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    const event: DeploymentEvent = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    };

    deployment.status.events.push(event);

    // Keep only recent events (last 50)
    if (deployment.status.events.length > 50) {
      deployment.status.events = deployment.status.events.slice(-50);
    }

    this.updateDeployment(deploymentId, deployment);
  }

  /**
   * Update deployment status
   */
  private updateDeployment(deploymentId: string, deployment: ActiveDeployment): void {
    deployment.status.lastUpdate = new Date().toISOString();
    this.deployments.set(deploymentId, deployment);
  }

  /**
   * Get empty metrics for initialization
   */
  private getEmptyMetrics() {
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
   * Create canary middleware that uses feature flags
   */
  createCanaryMiddleware(deploymentId: string, newMiddleware: Function) {
    return (req: any, res: any, next: any) => {
      const useNew = this.shouldUseNewMiddleware(deploymentId, req.requestId);

      if (useNew) {
        // Use new middleware
        return newMiddleware(req, res, next);
      } else {
        // Skip new middleware (use existing behavior)
        next();
      }
    };
  }
}

interface ActiveDeployment {
  id: string;
  middleware: MiddlewareDefinition;
  plan: DeploymentPlan;
  status: DeploymentStatus;
  stageStartTime: number;
  rollbackFunction: (() => Promise<void>) | null;
}

/**
 * Factory function for creating canary deployer
 */
export function createCanaryDeployer(metricsCollector: DeploymentMetricsCollector): CanaryDeployer {
  return new CanaryDeployer(metricsCollector);
}