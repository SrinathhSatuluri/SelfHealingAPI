/**
 * LLM-powered API root cause analysis package
 *
 * Exports:
 * - APIAnalyzerChain: Main analysis orchestrator
 * - LLMClient: Multi-provider LLM client
 * - Types: TypeScript interfaces for all components
 * - Utilities: Factory functions and quick analysis helpers
 */

import { AnalysisInput } from './types';

// Main analyzer chain
export { APIAnalyzerChain, createAnalyzerChain, analyzeAPIFailure } from './analyzer-chain';

// LLM client
export { LLMClient, createLLMClient } from './llm-client';

// Prompt templates
export { PromptBuilder, SYSTEM_PROMPT, PromptFragments } from './prompt-templates';

// Types
export type {
  AnalysisInput,
  AnalysisResult,
  ErrorLogEntry,
  SchemaDefinition,
  SchemaDiff,
  FixSuggestion,
  LLMConfig,
  LLMResponse,
  ChainConfig,
  ChainResult,
  ValidationError
} from './types';

// Re-export common configurations
export const CommonConfigurations = {
  // Fast analysis with Claude Haiku
  quickAnalysis: {
    llm: {
      provider: 'anthropic' as const,
      model: 'claude-3-haiku-20240307',
      temperature: 0.1,
      maxTokens: 1500,
      retryAttempts: 2
    },
    maxRetries: 2,
    validationStrict: false,
    enableReflection: false
  },

  // Detailed analysis with Claude Sonnet
  detailedAnalysis: {
    llm: {
      provider: 'anthropic' as const,
      model: 'claude-3-sonnet-20240229',
      temperature: 0.05,
      maxTokens: 3000,
      retryAttempts: 3
    },
    maxRetries: 3,
    validationStrict: true,
    enableReflection: true
  },

  // OpenAI GPT-4 configuration
  openaiAnalysis: {
    llm: {
      provider: 'openai' as const,
      model: 'gpt-4',
      temperature: 0.1,
      maxTokens: 2000,
      retryAttempts: 3
    },
    maxRetries: 3,
    validationStrict: true,
    enableReflection: true
  }
};

/**
 * Helper function to create analysis input from detection data
 */
export function createAnalysisInput(
  errorLogs: any[],
  schemaDiff: any,
  endpoint: string,
  errorRate: number
): AnalysisInput {
  return {
    errorLogs: errorLogs.map(log => ({
      timestamp: log.timestamp || new Date().toISOString(),
      statusCode: log.statusCode || 400,
      method: log.method || 'POST',
      url: log.url || endpoint,
      requestBody: log.requestBody || {},
      responseBody: log.responseBody || {},
      errorMessage: log.errorMessage || 'Unknown error'
    })),
    requestSchema: {
      fields: ['name', 'email', 'phone', 'password'],
      required: ['name', 'email', 'phone', 'password'],
      optional: [],
      types: {
        name: 'string',
        email: 'string',
        phone: 'string',
        password: 'string'
      }
    },
    responseSchema: {
      fields: ['success', 'userId', 'error'],
      required: ['success'],
      optional: ['userId', 'error'],
      types: {
        success: 'boolean',
        userId: 'string',
        error: 'string'
      }
    },
    schemaDiff: {
      missingFields: schemaDiff.missingFields || [],
      extraFields: schemaDiff.extraFields || [],
      possibleRenames: schemaDiff.possibleRenames || []
    },
    metadata: {
      endpoint,
      timestamp: new Date().toISOString(),
      errorRate,
      successRate: 1 - errorRate
    }
  };
}