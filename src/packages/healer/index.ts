/**
 * Self-healing code generation package
 *
 * Transforms LLM analysis results into validated, executable middleware
 */

// Core classes
export { CodeGenerator } from './code-generator';
export { CodeValidator, createValidator, DEFAULT_SECURITY_RULES } from './validator';
export { SafeExecutor, createExecutor } from './executor';

// Templates
export {
  TEMPLATES,
  TEMPLATE_METADATA,
  ADAPTER_MIDDLEWARE_TEMPLATE,
  VALIDATION_MIDDLEWARE_TEMPLATE,
  TRANSFORMATION_MIDDLEWARE_TEMPLATE,
  ROLLBACK_MIDDLEWARE_TEMPLATE
} from './templates/adapter-middleware';

// Types
export type {
  FixRequest,
  AnalysisResult,
  GeneratedCode,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  SecurityIssue,
  ASTInfo,
  CodeTemplate,
  TemplateVariable,
  TemplateExample,
  ExecutionResult,
  ExecutionMetrics,
  ExecutionError,
  HealerConfig,
  ValidationRule,
  DeploymentPlan,
  RollbackPlan,
  MonitoringPlan
} from './types';

// Utility functions
export const HealerUtils = {
  /**
   * Quick template-based fix generation
   */
  generateQuickFix: (sourceField: string, targetField: string): string => {
    return TEMPLATES.adapter
      .replace(/{{functionName}}/g, `map${capitalize(sourceField)}To${capitalize(targetField)}`)
      .replace(/{{sourceField}}/g, sourceField)
      .replace(/{{targetField}}/g, targetField)
      .replace(/{{description}}/g, `Map ${sourceField} to ${targetField}`)
      .replace(/{{timestamp}}/g, new Date().toISOString());
  },

  /**
   * Extract field mappings from analysis result
   */
  extractFieldMappings: (analysis: AnalysisResult): Array<{from: string, to: string}> => {
    const mappings: Array<{from: string, to: string}> = [];

    if (analysis.details.field && analysis.details.newFieldName) {
      mappings.push({
        from: analysis.details.field,
        to: analysis.details.newFieldName
      });
    }

    return mappings;
  },

  /**
   * Estimate fix complexity
   */
  estimateComplexity: (analysis: AnalysisResult): 'low' | 'medium' | 'high' => {
    if (analysis.confidence > 0.9 && analysis.suggestedFix.type === 'adapter') {
      return 'low';
    }
    if (analysis.confidence > 0.7 && analysis.details.breakingChange === false) {
      return 'medium';
    }
    return 'high';
  },

  /**
   * Check if fix is safe for automatic deployment
   */
  isSafeForAutoDeploy: (analysis: AnalysisResult): boolean => {
    return analysis.confidence > 0.8 &&
           analysis.suggestedFix.type === 'adapter' &&
           !analysis.details.breakingChange;
  }
};

// Common configurations
export const HealerConfigurations = {
  // Safe production configuration
  production: {
    generation: {
      llm: {
        provider: 'anthropic' as const,
        model: 'claude-3-sonnet-20240229',
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        temperature: 0.05, // Very conservative
        maxTokens: 1500,
        retryAttempts: 3
      },
      templates: { enabled: true },
      validation: { strict: true, allowUnsafePatterns: false }
    },
    execution: {
      safeMode: true,
      monitoringWindow: 300, // 5 minutes
      rollbackThreshold: 0.05, // 5% error rate
      maxConcurrentFixes: 1 // Conservative
    }
  },

  // Development configuration
  development: {
    generation: {
      llm: {
        provider: 'anthropic' as const,
        model: 'claude-3-haiku-20240307',
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        temperature: 0.1,
        maxTokens: 2000,
        retryAttempts: 2
      },
      templates: { enabled: true },
      validation: { strict: false, allowUnsafePatterns: false }
    },
    execution: {
      safeMode: false, // Faster iteration
      monitoringWindow: 30,
      rollbackThreshold: 0.2,
      maxConcurrentFixes: 5
    }
  },

  // Testing configuration
  testing: {
    generation: {
      llm: {
        provider: 'anthropic' as const,
        model: 'claude-3-haiku-20240307',
        apiKey: 'test-key',
        temperature: 0.1,
        maxTokens: 1000,
        retryAttempts: 1
      },
      templates: { enabled: true },
      validation: { strict: true, allowUnsafePatterns: false }
    },
    execution: {
      safeMode: false,
      monitoringWindow: 5,
      rollbackThreshold: 0.5,
      maxConcurrentFixes: 1
    }
  }
};

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Complete healing workflow function
 */
export async function performHealing(
  analysis: AnalysisResult,
  config?: Partial<HealerConfig>
): Promise<ExecutionResult> {
  const executor = createExecutor(config || HealerConfigurations.development);
  return await executor.executeHeal(analysis);
}

/**
 * Generate and validate fix without execution
 */
export async function generateFixCode(
  analysis: AnalysisResult,
  config?: Partial<HealerConfig>
): Promise<{ code: GeneratedCode; validation: ValidationResult }> {
  const generator = new CodeGenerator(config?.generation || HealerConfigurations.development.generation);
  const validator = createValidator(config?.generation?.validation?.strict);

  const code = await generator.generateFix(analysis);
  const validation = await validator.validateCode(code.content);

  return { code, validation };
}