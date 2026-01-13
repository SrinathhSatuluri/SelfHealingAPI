/**
 * Type definitions for the self-healing code generation system
 */

export interface FixRequest {
  analysisResult: AnalysisResult;
  targetEndpoint: string;
  priority: 'high' | 'medium' | 'low';
  strategy: 'adapter' | 'migration' | 'rollback' | 'schema-update';
}

export interface AnalysisResult {
  rootCause: string;
  confidence: number;
  details: {
    field?: string;
    expectedBy?: string;
    newFieldName?: string;
    breakingChange?: boolean;
    affectedEndpoints?: string[];
  };
  suggestedFix: {
    type: string;
    description: string;
    implementation: {
      strategy: string;
      codeExample?: string;
      steps: string[];
    };
  };
}

export interface GeneratedCode {
  id: string;
  content: string;
  type: 'middleware' | 'route' | 'validation' | 'transformation';
  description: string;
  metadata: {
    generatedAt: string;
    fixType: string;
    targetField?: string;
    sourceField?: string;
    confidence: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  securityIssues: SecurityIssue[];
  astInfo: ASTInfo;
}

export interface ValidationError {
  type: 'syntax' | 'type' | 'security' | 'structure';
  message: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'style' | 'compatibility';
  message: string;
  line?: number;
  suggestion?: string;
}

export interface SecurityIssue {
  type: 'injection' | 'eval' | 'prototype-pollution' | 'path-traversal';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  line?: number;
  pattern: string;
}

export interface ASTInfo {
  isValidMiddleware: boolean;
  hasExpectedSignature: boolean;
  modifiesRequest: boolean;
  modifiesResponse: boolean;
  callsNext: boolean;
  imports: string[];
  exports: string[];
  functions: string[];
}

export interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: TemplateVariable[];
  examples: TemplateExample[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: any;
  validation?: string; // Regex pattern
}

export interface TemplateExample {
  description: string;
  variables: Record<string, any>;
  expectedOutput: string;
}

export interface ExecutionResult {
  success: boolean;
  deployedAt?: string;
  rollbackAvailable: boolean;
  metrics: {
    beforeFix: ExecutionMetrics;
    afterFix?: ExecutionMetrics;
  };
  errors?: ExecutionError[];
}

export interface ExecutionMetrics {
  successRate: number;
  errorRate: number;
  averageResponseTime: number;
  requestCount: number;
  timestamp: string;
}

export interface ExecutionError {
  phase: 'generation' | 'validation' | 'deployment' | 'monitoring';
  error: string;
  details?: any;
  recoverable: boolean;
}

export interface HealerConfig {
  generation: {
    llm: {
      provider: 'anthropic' | 'openai';
      model: string;
      apiKey: string;
      temperature: number;
      maxTokens: number;
      retryAttempts: number;
    };
    templates: {
      enabled: boolean;
      customTemplatesPath?: string;
    };
    validation: {
      strict: boolean;
      allowUnsafePatterns: boolean;
      customRules?: ValidationRule[];
    };
  };
  execution: {
    safeMode: boolean;
    monitoringWindow: number; // seconds
    rollbackThreshold: number; // error rate
    maxConcurrentFixes: number;
  };
}

export interface ValidationRule {
  id: string;
  name: string;
  pattern: string | RegExp;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

export interface DeploymentPlan {
  id: string;
  fixId: string;
  strategy: 'immediate' | 'canary' | 'blue-green';
  rollbackPlan: RollbackPlan;
  monitoring: MonitoringPlan;
  estimatedRisk: 'low' | 'medium' | 'high';
}

export interface RollbackPlan {
  enabled: boolean;
  triggers: RollbackTrigger[];
  strategy: 'immediate' | 'graceful';
  preserveData: boolean;
}

export interface RollbackTrigger {
  metric: 'error-rate' | 'response-time' | 'success-rate';
  threshold: number;
  duration: number; // seconds to monitor
}

export interface MonitoringPlan {
  duration: number; // seconds
  metrics: string[];
  alertThresholds: Record<string, number>;
  samplingRate: number;
}