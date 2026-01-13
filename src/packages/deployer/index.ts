/**
 * Complete canary deployment and auto-healing system
 *
 * Exports all components needed for safe, monitored deployments
 */

// Core deployment system
export { CanaryDeployer, createCanaryDeployer } from './canary';
export { MiddlewareInjector, createInjector, compileMiddleware } from './injector';
export { AutoRollbackManager, createRollbackManager } from './rollback';

// Metrics and monitoring
export {
  DeploymentMetricsCollector,
  createMetricsCollector,
  createMetricsMiddleware
} from './metrics';

// Dashboard and visualization
export { DeploymentDashboard, createDashboard } from './dashboard';

// Import types for internal use
import { CanaryDeployer, createCanaryDeployer } from './canary';
import { MiddlewareInjector, createInjector, compileMiddleware } from './injector';
import { AutoRollbackManager, createRollbackManager } from './rollback';
import {
  DeploymentMetricsCollector,
  createMetricsCollector,
  createMetricsMiddleware
} from './metrics';
import { DeploymentDashboard, createDashboard } from './dashboard';

// Type definitions
export type {
  DeploymentMetrics,
  CanaryStage,
  DeploymentPlan,
  DeploymentStatus,
  DeploymentEvent,
  FeatureFlag,
  MiddlewareDefinition,
  HotDeployConfig,
  RollbackPlan,
  DashboardData,
  TimelineEvent,
  Alert,
  DeploymentResult,
  MetricsCollector
} from './types';

// Utility functions and configurations
export const DeploymentConfigurations = {
  // Production-safe deployment
  production: {
    canary: {
      stages: [
        { percentage: 5, duration: 300, successThreshold: 0.98, maxErrorRate: 0.02 },    // 5% for 5 minutes
        { percentage: 25, duration: 600, successThreshold: 0.97, maxErrorRate: 0.03 },   // 25% for 10 minutes
        { percentage: 100, duration: 900, successThreshold: 0.95, maxErrorRate: 0.05 }   // 100% for 15 minutes
      ],
      rollbackThresholds: {
        successRate: 0.95,
        errorRate: 0.05,
        latencyIncrease: 0.25 // 25% latency increase triggers rollback
      }
    },
    injection: {
      safeMode: true,
      validateBeforeDeploy: true,
      backupPrevious: true,
      maxConcurrentDeploys: 1
    }
  },

  // Development deployment (faster, more permissive)
  development: {
    canary: {
      stages: [
        { percentage: 20, duration: 30, successThreshold: 0.90, maxErrorRate: 0.10 },
        { percentage: 100, duration: 60, successThreshold: 0.85, maxErrorRate: 0.15 }
      ],
      rollbackThresholds: {
        successRate: 0.80,
        errorRate: 0.20,
        latencyIncrease: 0.50
      }
    },
    injection: {
      safeMode: false,
      validateBeforeDeploy: true,
      backupPrevious: false,
      maxConcurrentDeploys: 3
    }
  },

  // Demo configuration (fast for demonstrations)
  demo: {
    canary: {
      stages: [
        { percentage: 10, duration: 10, successThreshold: 0.85, maxErrorRate: 0.15 },
        { percentage: 50, duration: 15, successThreshold: 0.85, maxErrorRate: 0.15 },
        { percentage: 100, duration: 10, successThreshold: 0.85, maxErrorRate: 0.15 }
      ],
      rollbackThresholds: {
        successRate: 0.75,
        errorRate: 0.25,
        latencyIncrease: 0.75
      }
    },
    injection: {
      safeMode: false,
      validateBeforeDeploy: false,
      backupPrevious: false,
      maxConcurrentDeploys: 5
    }
  }
};

// Rollback trigger configurations
export const RollbackTriggers = {
  // Conservative triggers (production)
  conservative: [
    { metric: 'error-rate' as const, threshold: 0.05, duration: 60 },
    { metric: 'success-rate' as const, threshold: 0.95, duration: 60 },
    { metric: 'response-time' as const, threshold: 2000, duration: 30 }
  ],

  // Moderate triggers (staging)
  moderate: [
    { metric: 'error-rate' as const, threshold: 0.10, duration: 30 },
    { metric: 'success-rate' as const, threshold: 0.90, duration: 30 },
    { metric: 'response-time' as const, threshold: 5000, duration: 60 }
  ],

  // Aggressive triggers (development/demo)
  aggressive: [
    { metric: 'error-rate' as const, threshold: 0.25, duration: 10 },
    { metric: 'success-rate' as const, threshold: 0.75, duration: 10 },
    { metric: 'response-time' as const, threshold: 10000, duration: 30 }
  ]
};

/**
 * Complete deployment orchestrator
 * Combines all deployment components into a single interface
 */
export class SelfHealingDeployer {
  public canaryDeployer: CanaryDeployer;
  public metricsCollector: DeploymentMetricsCollector;
  public injector: MiddlewareInjector;
  public rollbackManager: AutoRollbackManager;
  public dashboard: DeploymentDashboard;

  constructor(
    app: any,
    config: 'production' | 'development' | 'demo' = 'demo'
  ) {
    const deployConfig = DeploymentConfigurations[config];

    // Initialize components
    this.metricsCollector = createMetricsCollector();
    this.canaryDeployer = createCanaryDeployer(this.metricsCollector);
    this.injector = createInjector(app, deployConfig.injection);
    this.rollbackManager = createRollbackManager(this.injector, this.canaryDeployer, this.metricsCollector);
    this.dashboard = createDashboard(this.canaryDeployer, this.metricsCollector, this.injector, this.rollbackManager);

    // Setup metrics middleware
    app.use(createMetricsMiddleware(this.metricsCollector));

    // Setup dashboard API
    this.dashboard.createDashboardAPI(app);

    console.log(`🚀 Self-healing deployer initialized in ${config} mode`);
  }

  /**
   * Deploy a fix with complete monitoring
   */
  async deployFix(
    middlewareCode: string,
    middlewareName: string,
    targetEndpoint: string
  ): Promise<string> {
    console.log(`🛠️ Starting complete deployment workflow for: ${middlewareName}`);

    try {
      // Start healing process
      this.dashboard.startHealing('auto-healing', targetEndpoint);

      // Compile middleware
      const middlewareFunction = compileMiddleware(middlewareCode, middlewareName);

      // Create middleware definition
      const middlewareDefinition = {
        id: `middleware_${Date.now()}`,
        name: middlewareName,
        code: middlewareCode,
        targetEndpoint,
        priority: 1,
        conditions: {
          methods: ['POST'],
          paths: [targetEndpoint]
        }
      };

      // Inject middleware
      const injectionId = await this.injector.injectMiddleware(middlewareDefinition, middlewareFunction);

      // Start canary deployment
      const deploymentId = await this.canaryDeployer.deployCanary(middlewareDefinition);

      // Record deployment start
      this.dashboard.recordDeploymentStart(deploymentId);

      // Start rollback monitoring
      this.rollbackManager.startMonitoring(deploymentId, {
        id: `rollback_${deploymentId}`,
        deploymentId,
        trigger: 'automatic',
        strategy: 'immediate',
        preserveData: true,
        triggers: RollbackTriggers.aggressive
      });

      console.log(`✅ Deployment workflow initiated:`);
      console.log(`   Injection ID: ${injectionId}`);
      console.log(`   Deployment ID: ${deploymentId}`);

      return deploymentId;

    } catch (error) {
      console.error(`❌ Deployment workflow failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get deployment status
   */
  getStatus(deploymentId: string) {
    return {
      deployment: this.canaryDeployer.getDeploymentStatus(deploymentId),
      rollback: this.rollbackManager.getMonitorStatus(deploymentId),
      dashboard: this.dashboard.getDashboardData()
    };
  }

  /**
   * Emergency stop all deployments
   */
  async emergencyStop(reason?: string): Promise<void> {
    console.log('🚨 EMERGENCY STOP - Halting all deployments');

    await Promise.all([
      this.injector.emergencyStop(),
      this.rollbackManager.emergencyRollbackAll(reason)
    ]);

    console.log('🛑 Emergency stop completed');
  }

  /**
   * Get comprehensive system status
   */
  getSystemStatus() {
    return {
      deployments: this.canaryDeployer.getActiveDeployments(),
      injections: this.injector.getAllInjections(),
      metrics: this.metricsCollector.getMetrics('/api/signup'),
      rollbacks: this.rollbackManager.getRollbackHistory(5),
      dashboard: this.dashboard.exportDashboardData()
    };
  }
}

/**
 * Quick deployment function for demos
 */
export async function quickDeploy(
  app: any,
  middlewareCode: string,
  targetEndpoint: string = '/api/signup'
): Promise<SelfHealingDeployer> {
  const deployer = new SelfHealingDeployer(app, 'demo');

  // Wait a moment for initialization
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Deploy the fix
  await deployer.deployFix(middlewareCode, 'quick-fix', targetEndpoint);

  return deployer;
}

/**
 * Create a complete self-healing system
 */
export function createSelfHealingSystem(
  app: any,
  config: 'production' | 'development' | 'demo' = 'demo'
): SelfHealingDeployer {
  return new SelfHealingDeployer(app, config);
}