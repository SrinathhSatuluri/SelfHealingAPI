/**
 * Type definitions for LLM-powered root cause analysis
 */

export interface AnalysisInput {
  errorLogs: ErrorLogEntry[];
  requestSchema: SchemaDefinition;
  responseSchema: SchemaDefinition;
  schemaDiff: SchemaDiff;
  metadata: {
    endpoint: string;
    timestamp: string;
    errorRate: number;
    successRate: number;
  };
}

export interface ErrorLogEntry {
  timestamp: string;
  statusCode: number;
  method: string;
  url: string;
  requestBody: Record<string, any>;
  responseBody: Record<string, any>;
  errorMessage: string;
}

export interface SchemaDefinition {
  fields: string[];
  required: string[];
  optional: string[];
  types: Record<string, string>;
}

export interface SchemaDiff {
  missingFields: string[];
  extraFields: string[];
  possibleRenames: Array<{
    from: string;
    to: string;
    confidence: number;
  }>;
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
  suggestedFix: FixSuggestion;
  reasoning: string[];
}

export interface FixSuggestion {
  type: 'adapter' | 'migration' | 'rollback' | 'schema-update';
  description: string;
  implementation: {
    strategy: string;
    codeExample?: string;
    steps: string[];
  };
  priority: 'high' | 'medium' | 'low';
  estimatedImpact: {
    downtime: string;
    complexity: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
  };
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  retryAttempts?: number;
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface ChainConfig {
  llm: LLMConfig;
  maxRetries: number;
  validationStrict: boolean;
  enableReflection: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  received: any;
  expected: string;
}

export interface ChainResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  retryCount: number;
  duration: number;
}