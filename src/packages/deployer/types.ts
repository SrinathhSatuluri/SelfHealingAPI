/**
 * Type definitions for the canary deployment system
 */

export interface DeploymentMetrics {
  successRate: number;      // % of 2xx responses
  errorRate: number;        // % of 4xx/5xx responses
  latency: number;          // Average response time (ms)
  throughput: number;       // Requests per second
  timestamp: string;
  sampleSize: number;       // Number of requests in sample
}

export interface CanaryStage {
  percentage: number;       // Traffic percentage (10, 50, 100)
  duration: number;         // Monitoring duration (seconds)
  successThreshold: number; // Required success rate (0.95 = 95%)
  maxErrorRate: number;     // Maximum allowed error rate
}

export interface DeploymentPlan {
  id: string;
  fixId: string;
  stages: CanaryStage[];
  rollbackThresholds: {
    successRate: number;
    errorRate: number;
    latencyIncrease: number; // % increase from baseline
  };
  monitoring: {
    windowSize: number;      // Metrics window in seconds
    sampleFrequency: number; // How often to collect metrics
  };
}

export interface DeploymentStatus {
  id: string;
  stage: 'planning' | 'deploying' | 'monitoring' | 'promoting' | 'completed' | 'rolling-back' | 'failed';
  currentStage: number;     // Index in stages array
  trafficPercentage: number;
  startTime: string;
  lastUpdate: string;
  metrics: {
    baseline: DeploymentMetrics;
    current: DeploymentMetrics;
    history: DeploymentMetrics[];
  };
  events: DeploymentEvent[];
}

export interface DeploymentEvent {
  timestamp: string;
  type: 'stage-start' | 'stage-complete' | 'metrics-check' | 'rollback' | 'error';
  stage?: number;
  message: string;
  data?: any;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
  conditions?: FeatureFlagCondition[];
}

export interface FeatureFlagCondition {
  field: string;            // 'user_id', 'endpoint', 'header'
  operator: 'equals' | 'in' | 'contains' | 'regex';
  value: any;
}

export interface MiddlewareDefinition {
  id: string;
  name: string;
  code: string;
  targetEndpoint: string;
  priority: number;         // Execution order
  conditions?: {
    methods?: string[];     // ['POST', 'PUT']
    paths?: string[];       // ['/api/signup', '/api/login']
    headers?: Record<string, string>;
  };
}

export interface HotDeployConfig {
  safeMode: boolean;
  validateBeforeDeploy: boolean;
  backupPrevious: boolean;
  maxConcurrentDeploys: number;
}

export interface RollbackPlan {
  id: string;
  deploymentId: string;
  trigger: 'manual' | 'automatic' | 'timeout';
  strategy: 'immediate' | 'gradual';
  preserveData: boolean;
  backupLocation?: string;
  triggers?: RollbackTrigger[];
}

export interface RollbackTrigger {
  metric: 'error-rate' | 'response-time' | 'success-rate';
  threshold: number;
  duration: number; // seconds to monitor
}

export interface DashboardData {
  timeline: TimelineEvent[];
  currentStatus: DeploymentStatus;
  metrics: {
    healing: {
      totalAttempts: number;
      successfulHeals: number;
      averageHealTime: number;
      lastHealing: string;
    };
    performance: {
      baseline: DeploymentMetrics;
      current: DeploymentMetrics;
      improvement: {
        successRate: number;
        errorReduction: number;
        latencyChange: number;
      };
    };
  };
  alerts: Alert[];
}

export interface TimelineEvent {
  timestamp: string;
  phase: 'detection' | 'analysis' | 'generation' | 'validation' | 'deployment' | 'completion';
  title: string;
  description: string;
  status: 'in-progress' | 'completed' | 'failed' | 'skipped';
  duration?: number;
  data?: any;
}

export interface Alert {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  resolved?: boolean;
  resolvedAt?: string;
}

export interface DeploymentResult {
  success: boolean;
  deploymentId: string;
  finalStage: number;
  duration: number;
  metricsImprovement: {
    successRateChange: number;
    errorRateChange: number;
    latencyChange: number;
  };
  rollbackPerformed: boolean;
  errors?: string[];
}

export interface MetricsCollector {
  startCollection(endpoint: string): void;
  stopCollection(endpoint: string): void;
  getMetrics(endpoint: string, windowSeconds?: number): DeploymentMetrics;
  getBaseline(endpoint: string): DeploymentMetrics | null;
  setBaseline(endpoint: string, metrics: DeploymentMetrics): void;
}