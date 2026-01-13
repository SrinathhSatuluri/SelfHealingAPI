import { CanaryDeployer } from './canary';
import { DeploymentMetricsCollector } from './metrics';
import { MiddlewareInjector } from './injector';
import { AutoRollbackManager } from './rollback';
import {
  DashboardData,
  TimelineEvent,
  Alert,
  DeploymentStatus,
  DeploymentMetrics
} from './types';

/**
 * Real-time dashboard for monitoring self-healing deployment process
 * Shows complete timeline: Detection → Analysis → Fix → Deploy
 */
export class DeploymentDashboard {
  private canaryDeployer: CanaryDeployer;
  private metricsCollector: DeploymentMetricsCollector;
  private injector: MiddlewareInjector;
  private rollbackManager: AutoRollbackManager;

  private timeline: TimelineEvent[] = [];
  private alerts: Alert[] = [];
  private currentDeployment: string | null = null;
  private healingStartTime: number | null = null;

  constructor(
    canaryDeployer: CanaryDeployer,
    metricsCollector: DeploymentMetricsCollector,
    injector: MiddlewareInjector,
    rollbackManager: AutoRollbackManager
  ) {
    this.canaryDeployer = canaryDeployer;
    this.metricsCollector = metricsCollector;
    this.injector = injector;
    this.rollbackManager = rollbackManager;

    // Start dashboard update loop
    this.startDashboardUpdates();
  }

  /**
   * Record start of healing process
   */
  startHealing(trigger: string, endpoint: string): void {
    this.healingStartTime = Date.now();
    this.currentDeployment = null;

    console.log('\n' + '='.repeat(80));
    console.log('🚀 SELF-HEALING API DEMO - STARTING HEALING PROCESS');
    console.log('='.repeat(80));

    this.addTimelineEvent('detection', 'Issue Detected', `API issues detected on ${endpoint}`, 'in-progress', {
      trigger,
      endpoint
    });

    this.addAlert('info', 'Healing Started', `Self-healing process initiated for ${endpoint}`);
  }

  /**
   * Record completion of analysis phase
   */
  recordAnalysisComplete(analysisResult: any): void {
    this.updateTimelineEvent('detection', 'completed');

    this.addTimelineEvent('analysis', 'Root Cause Analysis', `LLM identified: ${analysisResult.rootCause}`, 'in-progress', {
      rootCause: analysisResult.rootCause,
      confidence: analysisResult.confidence,
      suggestedFix: analysisResult.suggestedFix
    });

    setTimeout(() => {
      this.updateTimelineEvent('analysis', 'completed');
    }, 1000);

    this.addAlert('info', 'Analysis Complete',
      `Root cause identified with ${(analysisResult.confidence * 100).toFixed(1)}% confidence: ${analysisResult.rootCause}`
    );
  }

  /**
   * Record start of code generation
   */
  recordCodeGeneration(generatedCode: any): void {
    this.addTimelineEvent('generation', 'Code Generation', 'Generating and validating middleware code', 'in-progress', {
      codeId: generatedCode.id,
      fixType: generatedCode.metadata.fixType
    });

    setTimeout(() => {
      this.updateTimelineEvent('generation', 'completed');
    }, 2000);

    this.addAlert('info', 'Code Generated', `${generatedCode.metadata.fixType} middleware generated and validated`);
  }

  /**
   * Record start of deployment
   */
  recordDeploymentStart(deploymentId: string): void {
    this.currentDeployment = deploymentId;

    this.addTimelineEvent('deployment', 'Canary Deployment', 'Deploying fix with gradual rollout', 'in-progress', {
      deploymentId,
      strategy: 'canary'
    });

    this.addAlert('info', 'Deployment Started', `Canary deployment initiated: ${deploymentId}`);
  }

  /**
   * Record deployment completion
   */
  recordDeploymentComplete(deploymentId: string, success: boolean): void {
    this.updateTimelineEvent('deployment', success ? 'completed' : 'failed');

    if (success) {
      this.addTimelineEvent('completion', 'Healing Complete', 'API successfully healed and validated', 'completed', {
        deploymentId,
        totalTime: this.healingStartTime ? Date.now() - this.healingStartTime : 0
      });

      const totalTime = this.healingStartTime ? (Date.now() - this.healingStartTime) / 1000 : 0;

      this.addAlert('info', 'Healing Complete', `API successfully healed in ${totalTime.toFixed(1)} seconds`);

      console.log('\n' + '='.repeat(80));
      console.log('✅ SELF-HEALING COMPLETED SUCCESSFULLY');
      console.log(`⏱️ Total healing time: ${totalTime.toFixed(1)} seconds`);
      console.log('='.repeat(80));

    } else {
      this.addAlert('error', 'Healing Failed', 'Deployment failed and was rolled back');
    }
  }

  /**
   * Get complete dashboard data
   */
  getDashboardData(): DashboardData {
    const currentStatus = this.getCurrentStatus();
    const healingMetrics = this.getHealingMetrics();
    const performanceMetrics = this.getPerformanceMetrics();

    return {
      timeline: this.timeline.slice(-20), // Last 20 events
      currentStatus: currentStatus!,
      metrics: {
        healing: healingMetrics,
        performance: performanceMetrics
      },
      alerts: this.alerts.slice(-10) // Last 10 alerts
    };
  }

  /**
   * Print real-time dashboard to console
   */
  printDashboard(): void {
    const data = this.getDashboardData();

    console.clear();
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log('║' + ' '.repeat(25) + '🚀 SELF-HEALING API DASHBOARD' + ' '.repeat(25) + '║');
    console.log('╚' + '═'.repeat(78) + '╝');
    console.log();

    // Timeline
    console.log('📋 HEALING TIMELINE:');
    console.log('─'.repeat(80));

    data.timeline.forEach((event, index) => {
      const icon = this.getStatusIcon(event.status);
      const time = new Date(event.timestamp).toLocaleTimeString();

      console.log(`${icon} ${time} │ ${event.phase.toUpperCase().padEnd(12)} │ ${event.title}`);

      if (event.description && event.status === 'in-progress') {
        console.log(`${''.padEnd(12)} │ ${''.padEnd(12)} │ ${event.description}`);
      }

      if (index < data.timeline.length - 1) {
        console.log(`${''.padEnd(12)} │`);
      }
    });

    console.log();

    // Current Status
    if (data.currentStatus) {
      console.log('🎯 CURRENT DEPLOYMENT:');
      console.log('─'.repeat(80));
      console.log(`Status: ${data.currentStatus.stage.toUpperCase()}`);
      console.log(`Traffic: ${data.currentStatus.trafficPercentage}%`);
      console.log(`Stage: ${data.currentStatus.currentStage + 1}/3`);

      if (data.currentStatus.metrics.current.sampleSize > 0) {
        const metrics = data.currentStatus.metrics.current;
        console.log(`Metrics: ${(metrics.successRate * 100).toFixed(1)}% success | ${(metrics.errorRate * 100).toFixed(1)}% error | ${metrics.latency.toFixed(0)}ms latency`);
      }
      console.log();
    }

    // Performance Metrics
    console.log('📊 PERFORMANCE METRICS:');
    console.log('─'.repeat(80));

    if (data.metrics.performance.improvement.successRate !== 0) {
      const improvement = data.metrics.performance.improvement;
      console.log(`Success Rate: ${this.formatChange(improvement.successRate * 100, '%')}`);
      console.log(`Error Rate: ${this.formatChange(-improvement.errorReduction * 100, '%')}`);
      console.log(`Latency: ${this.formatChange(improvement.latencyChange, 'ms')}`);
    } else {
      console.log('Baseline metrics being established...');
    }

    console.log();

    // Recent Alerts
    console.log('🚨 RECENT ALERTS:');
    console.log('─'.repeat(80));

    if (data.alerts.length === 0) {
      console.log('No recent alerts');
    } else {
      data.alerts.slice(-5).forEach(alert => {
        const icon = this.getAlertIcon(alert.level);
        const time = new Date(alert.timestamp).toLocaleTimeString();
        console.log(`${icon} ${time} │ ${alert.title}: ${alert.message}`);
      });
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);

    // Add live metrics if deployment is active
    if (this.currentDeployment) {
      const status = this.canaryDeployer.getDeploymentStatus(this.currentDeployment);
      if (status && (status.stage === 'monitoring' || status.stage === 'deploying')) {
        console.log('🔄 Live monitoring active...');
      }
    }

    console.log('═'.repeat(80));
  }

  /**
   * Start dashboard update loop
   */
  private startDashboardUpdates(): void {
    // Update dashboard every 2 seconds during active deployments
    setInterval(() => {
      if (this.currentDeployment) {
        const status = this.canaryDeployer.getDeploymentStatus(this.currentDeployment);
        if (status && status.stage !== 'completed' && status.stage !== 'failed') {
          this.printDashboard();
        }
      }
    }, 2000);
  }

  /**
   * Add timeline event
   */
  private addTimelineEvent(
    phase: TimelineEvent['phase'],
    title: string,
    description: string,
    status: TimelineEvent['status'],
    data?: any
  ): void {
    const event: TimelineEvent = {
      timestamp: new Date().toISOString(),
      phase,
      title,
      description,
      status,
      data
    };

    this.timeline.push(event);

    // Keep only recent events (last 50)
    if (this.timeline.length > 50) {
      this.timeline = this.timeline.slice(-50);
    }
  }

  /**
   * Update existing timeline event
   */
  private updateTimelineEvent(phase: TimelineEvent['phase'], status: TimelineEvent['status']): void {
    for (let i = this.timeline.length - 1; i >= 0; i--) {
      if (this.timeline[i].phase === phase) {
        this.timeline[i].status = status;

        if (status === 'completed' && this.timeline[i].data) {
          this.timeline[i].duration = Date.now() - new Date(this.timeline[i].timestamp).getTime();
        }
        break;
      }
    }
  }

  /**
   * Add alert
   */
  private addAlert(level: Alert['level'], title: string, message: string): void {
    const alert: Alert = {
      id: `alert_${Date.now()}`,
      timestamp: new Date().toISOString(),
      level,
      title,
      message
    };

    this.alerts.push(alert);

    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    // Log important alerts
    if (level === 'error' || level === 'critical') {
      console.log(`🚨 ${level.toUpperCase()}: ${title} - ${message}`);
    }
  }

  /**
   * Get current deployment status
   */
  private getCurrentStatus(): DeploymentStatus | null {
    if (!this.currentDeployment) {
      return null;
    }

    return this.canaryDeployer.getDeploymentStatus(this.currentDeployment);
  }

  /**
   * Get healing metrics
   */
  private getHealingMetrics() {
    return {
      totalAttempts: this.timeline.filter(e => e.phase === 'detection').length,
      successfulHeals: this.timeline.filter(e => e.phase === 'completion' && e.status === 'completed').length,
      averageHealTime: this.getAverageHealTime(),
      lastHealing: this.getLastHealingTime()
    };
  }

  /**
   * Get performance metrics
   */
  private getPerformanceMetrics() {
    const baseline = this.metricsCollector.getBaseline('/api/signup');
    const current = this.metricsCollector.getMetrics('/api/signup');

    if (!baseline) {
      return {
        baseline: this.getEmptyMetrics(),
        current: this.getEmptyMetrics(),
        improvement: {
          successRate: 0,
          errorReduction: 0,
          latencyChange: 0
        }
      };
    }

    return {
      baseline,
      current,
      improvement: {
        successRate: current.successRate - baseline.successRate,
        errorReduction: baseline.errorRate - current.errorRate,
        latencyChange: current.latency - baseline.latency
      }
    };
  }

  /**
   * Get status icon for timeline
   */
  private getStatusIcon(status: TimelineEvent['status']): string {
    switch (status) {
      case 'in-progress': return '🔄';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'skipped': return '⏭️';
      default: return '⚪';
    }
  }

  /**
   * Get alert icon
   */
  private getAlertIcon(level: Alert['level']): string {
    switch (level) {
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'critical': return '🚨';
      default: return 'ℹ️';
    }
  }

  /**
   * Format change value with color coding
   */
  private formatChange(value: number, unit: string): string {
    const sign = value >= 0 ? '+' : '';
    const formatted = `${sign}${value.toFixed(1)}${unit}`;

    // Add indicators (in real dashboard, you might use colors)
    if (value > 0 && (unit === '%' || unit === 'ms')) {
      return `${formatted} ↗️`;
    } else if (value < 0) {
      return `${formatted} ↘️`;
    } else {
      return `${formatted} →`;
    }
  }

  /**
   * Get average healing time
   */
  private getAverageHealTime(): number {
    const completedHealings = this.timeline.filter(e =>
      e.phase === 'completion' && e.status === 'completed' && e.duration
    );

    if (completedHealings.length === 0) return 0;

    const totalTime = completedHealings.reduce((sum, event) => sum + (event.duration || 0), 0);
    return totalTime / completedHealings.length / 1000; // Convert to seconds
  }

  /**
   * Get last healing time
   */
  private getLastHealingTime(): string {
    const lastHealing = this.timeline
      .filter(e => e.phase === 'completion')
      .slice(-1)[0];

    return lastHealing ? lastHealing.timestamp : '';
  }

  /**
   * Get empty metrics
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
   * Export dashboard data for external use
   */
  exportDashboardData(): any {
    return {
      ...this.getDashboardData(),
      injectorStats: this.injector.getStatistics(),
      rollbackHistory: this.rollbackManager.getRollbackHistory(5),
      activeMonitors: this.rollbackManager.getActiveMonitors()
    };
  }

  /**
   * Create HTTP endpoint for dashboard API
   */
  createDashboardAPI(app: any): void {
    app.get('/api/dashboard', (req: any, res: any) => {
      res.json(this.exportDashboardData());
    });

    app.get('/api/dashboard/timeline', (req: any, res: any) => {
      res.json(this.timeline);
    });

    app.get('/api/dashboard/metrics', (req: any, res: any) => {
      res.json(this.getPerformanceMetrics());
    });

    app.get('/api/dashboard/alerts', (req: any, res: any) => {
      res.json(this.alerts);
    });

    console.log('📊 Dashboard API endpoints created:');
    console.log('   GET /api/dashboard - Complete dashboard data');
    console.log('   GET /api/dashboard/timeline - Timeline events');
    console.log('   GET /api/dashboard/metrics - Performance metrics');
    console.log('   GET /api/dashboard/alerts - Recent alerts');
  }
}

/**
 * Factory function for creating dashboard
 */
export function createDashboard(
  canaryDeployer: CanaryDeployer,
  metricsCollector: DeploymentMetricsCollector,
  injector: MiddlewareInjector,
  rollbackManager: AutoRollbackManager
): DeploymentDashboard {
  return new DeploymentDashboard(canaryDeployer, metricsCollector, injector, rollbackManager);
}