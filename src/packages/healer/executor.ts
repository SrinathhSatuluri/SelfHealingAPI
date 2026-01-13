import { CodeGenerator } from './code-generator';
import { CodeValidator } from './validator';
import {
  AnalysisResult,
  GeneratedCode,
  ValidationResult,
  ExecutionResult,
  HealerConfig,
  DeploymentPlan,
  RollbackPlan
} from './types';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Safe code execution engine with validation and rollback
 * Implements circuit breaker pattern for safe deployments
 */
export class SafeExecutor {
  private generator: CodeGenerator;
  private validator: CodeValidator;
  private config: HealerConfig;
  private deployedFixes: Map<string, DeployedFix> = new Map();
  private rollbackStack: RollbackEntry[] = [];

  constructor(config: HealerConfig) {
    this.config = config;
    this.generator = new CodeGenerator(config);
    this.validator = new CodeValidator();
  }

  /**
   * Main execution workflow: Generate -> Validate -> Deploy
   */
  async executeHeal(analysis: AnalysisResult): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = randomUUID();

    console.log(`🚀 Starting healing process for: ${analysis.rootCause}`);

    const result: ExecutionResult = {
      success: false,
      rollbackAvailable: false,
      metrics: {
        beforeFix: await this.captureMetrics()
      }
    };

    try {
      // Step 1: Generate code
      console.log('📝 Generating fix code...');
      const generatedCode = await this.generator.generateFix(analysis);

      // Step 2: Validate code
      console.log('🔍 Validating generated code...');
      const validationResult = await this.validator.validateCode(generatedCode.content, 'middleware');

      if (!validationResult.isValid) {
        throw new Error(`Code validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }

      // Step 3: Create deployment plan
      const deploymentPlan = this.createDeploymentPlan(generatedCode, analysis);

      // Step 4: Safe deployment
      if (this.config.execution.safeMode) {
        console.log('🛡️ Safe mode enabled - monitoring deployment...');
        await this.safeDeployment(generatedCode, deploymentPlan);
      } else {
        console.log('⚡ Immediate deployment...');
        await this.immediateDeployment(generatedCode);
      }

      // Step 5: Monitor and validate
      console.log('📊 Monitoring fix effectiveness...');
      await this.sleep(this.config.execution.monitoringWindow * 1000);

      result.metrics.afterFix = await this.captureMetrics();
      result.deployedAt = new Date().toISOString();
      result.success = this.validateFixSuccess(result.metrics.beforeFix, result.metrics.afterFix);
      result.rollbackAvailable = true;

      if (!result.success) {
        console.log('❌ Fix validation failed, initiating rollback...');
        await this.rollback(executionId);
        result.rollbackAvailable = false;
      }

      console.log(`${result.success ? '✅' : '❌'} Healing process completed in ${Date.now() - startTime}ms`);

      return result;

    } catch (error) {
      console.error('💥 Healing process failed:', error.message);

      result.errors = [{
        phase: 'execution',
        error: error.message,
        details: { executionId, timestamp: new Date().toISOString() },
        recoverable: true
      }];

      // Attempt rollback if deployment was started
      if (this.deployedFixes.has(executionId)) {
        console.log('🔄 Attempting emergency rollback...');
        await this.rollback(executionId);
      }

      return result;
    }
  }

  /**
   * Generate code with iterative refinement
   */
  async generateWithValidation(analysis: AnalysisResult, maxAttempts: number = 3): Promise<GeneratedCode> {
    let validationFeedback = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`🔄 Generation attempt ${attempt}/${maxAttempts}`);

      try {
        // Include validation feedback in subsequent attempts
        const enhancedAnalysis = validationFeedback
          ? { ...analysis, validationFeedback }
          : analysis;

        const generatedCode = await this.generator.generateFix(enhancedAnalysis);
        const validation = await this.validator.validateCode(generatedCode.content);

        if (validation.isValid) {
          console.log(`✅ Code generation successful on attempt ${attempt}`);
          return generatedCode;
        }

        // Prepare feedback for next attempt
        validationFeedback = this.buildValidationFeedback(validation);
        console.log(`❌ Attempt ${attempt} failed validation, refining...`);

      } catch (error) {
        console.warn(`⚠️ Generation attempt ${attempt} failed:`, error.message);
        validationFeedback += `\nPrevious attempt failed: ${error.message}`;
      }
    }

    throw new Error(`Failed to generate valid code after ${maxAttempts} attempts`);
  }

  /**
   * Create a deployment plan with safety measures
   */
  private createDeploymentPlan(code: GeneratedCode, analysis: AnalysisResult): DeploymentPlan {
    return {
      id: randomUUID(),
      fixId: code.id,
      strategy: this.config.execution.safeMode ? 'canary' : 'immediate',
      rollbackPlan: {
        enabled: true,
        triggers: [
          { metric: 'error-rate', threshold: this.config.execution.rollbackThreshold, duration: 30 },
          { metric: 'success-rate', threshold: 0.5, duration: 30 }
        ],
        strategy: 'immediate',
        preserveData: true
      },
      monitoring: {
        duration: this.config.execution.monitoringWindow,
        metrics: ['error-rate', 'success-rate', 'response-time'],
        alertThresholds: {
          'error-rate': 0.1,
          'success-rate': 0.9,
          'response-time': 5000
        },
        samplingRate: 1.0
      },
      estimatedRisk: analysis.confidence > 0.8 ? 'low' : analysis.confidence > 0.6 ? 'medium' : 'high'
    };
  }

  /**
   * Safe deployment with monitoring
   */
  private async safeDeployment(code: GeneratedCode, plan: DeploymentPlan): Promise<void> {
    const deployedFix: DeployedFix = {
      id: plan.fixId,
      code: code.content,
      deployedAt: new Date().toISOString(),
      plan,
      active: true
    };

    // Save to temporary file for dynamic loading
    const tempFilePath = await this.saveToTempFile(code);
    deployedFix.filePath = tempFilePath;

    // Register deployment
    this.deployedFixes.set(plan.fixId, deployedFix);

    // Add to rollback stack
    this.rollbackStack.push({
      id: plan.fixId,
      timestamp: new Date().toISOString(),
      type: 'deployment',
      data: { filePath: tempFilePath, plan }
    });

    console.log(`✅ Safe deployment completed: ${plan.fixId}`);
  }

  /**
   * Immediate deployment (no monitoring)
   */
  private async immediateDeployment(code: GeneratedCode): Promise<void> {
    const tempFilePath = await this.saveToTempFile(code);

    const deployedFix: DeployedFix = {
      id: code.id,
      code: code.content,
      deployedAt: new Date().toISOString(),
      active: true,
      filePath: tempFilePath
    };

    this.deployedFixes.set(code.id, deployedFix);

    console.log(`⚡ Immediate deployment completed: ${code.id}`);
  }

  /**
   * Rollback to previous state
   */
  async rollback(fixId: string): Promise<void> {
    console.log(`🔄 Rolling back fix: ${fixId}`);

    const deployedFix = this.deployedFixes.get(fixId);
    if (!deployedFix) {
      throw new Error(`Fix not found for rollback: ${fixId}`);
    }

    try {
      // Remove deployed file
      if (deployedFix.filePath) {
        await fs.unlink(deployedFix.filePath);
      }

      // Mark as inactive
      deployedFix.active = false;
      this.deployedFixes.set(fixId, deployedFix);

      // Remove from rollback stack
      this.rollbackStack = this.rollbackStack.filter(entry => entry.id !== fixId);

      console.log(`✅ Rollback completed: ${fixId}`);

    } catch (error) {
      console.error(`❌ Rollback failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save generated code to temporary file
   */
  private async saveToTempFile(code: GeneratedCode): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp', 'generated-fixes');
    await fs.mkdir(tempDir, { recursive: true });

    const fileName = `${code.id}.js`;
    const filePath = path.join(tempDir, fileName);

    // Compile TypeScript to JavaScript for runtime use
    const jsCode = this.compileTypeScriptToJS(code.content);
    await fs.writeFile(filePath, jsCode, 'utf8');

    return filePath;
  }

  /**
   * Simple TypeScript to JavaScript compilation
   */
  private compileTypeScriptToJS(tsCode: string): string {
    // Basic transformation (remove types, keep logic)
    return tsCode
      .replace(/import\s+{[^}]+}\s+from\s+['"][^'"]+['"];?\s*/g, '') // Remove type imports
      .replace(/:\s*Request/g, '')
      .replace(/:\s*Response/g, '')
      .replace(/:\s*NextFunction/g, '')
      .replace(/export\s+/g, 'module.exports = ');
  }

  /**
   * Capture current system metrics
   */
  private async captureMetrics(): Promise<any> {
    // In a real implementation, this would capture actual metrics
    return {
      successRate: 0.95,
      errorRate: 0.05,
      averageResponseTime: 150,
      requestCount: 100,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate if the fix was successful
   */
  private validateFixSuccess(beforeMetrics: any, afterMetrics: any): boolean {
    const successRateImproved = afterMetrics.successRate > beforeMetrics.successRate;
    const errorRateDecreased = afterMetrics.errorRate < beforeMetrics.errorRate;
    const errorRateAcceptable = afterMetrics.errorRate < this.config.execution.rollbackThreshold;

    return successRateImproved && errorRateDecreased && errorRateAcceptable;
  }

  /**
   * Build validation feedback for iterative refinement
   */
  private buildValidationFeedback(validation: ValidationResult): string {
    const feedback: string[] = [];

    validation.errors.forEach(error => {
      feedback.push(`ERROR: ${error.message}`);
      if (error.suggestion) {
        feedback.push(`SUGGESTION: ${error.suggestion}`);
      }
    });

    validation.securityIssues.forEach(issue => {
      if (issue.severity === 'critical' || issue.severity === 'high') {
        feedback.push(`SECURITY: ${issue.message} (Pattern: ${issue.pattern})`);
      }
    });

    return feedback.join('\n');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get execution status
   */
  getExecutionStatus(): any {
    return {
      deployedFixes: Array.from(this.deployedFixes.values()),
      rollbackStack: this.rollbackStack,
      activeFixesCount: Array.from(this.deployedFixes.values()).filter(f => f.active).length
    };
  }
}

interface DeployedFix {
  id: string;
  code: string;
  deployedAt: string;
  plan?: DeploymentPlan;
  active: boolean;
  filePath?: string;
}

interface RollbackEntry {
  id: string;
  timestamp: string;
  type: 'deployment' | 'config' | 'rollback';
  data: any;
}

/**
 * Factory function for creating executor with common configurations
 */
export function createExecutor(config: Partial<HealerConfig>): SafeExecutor {
  const defaultConfig: HealerConfig = {
    generation: {
      llm: {
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        temperature: 0.1,
        maxTokens: 2000,
        retryAttempts: 3
      },
      templates: { enabled: true },
      validation: { strict: true, allowUnsafePatterns: false }
    },
    execution: {
      safeMode: true,
      monitoringWindow: 60, // 60 seconds
      rollbackThreshold: 0.1, // 10% error rate
      maxConcurrentFixes: 3
    }
  };

  const mergedConfig = { ...defaultConfig, ...config };
  return new SafeExecutor(mergedConfig);
}