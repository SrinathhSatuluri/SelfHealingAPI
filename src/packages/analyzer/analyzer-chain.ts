import { LLMClient } from './llm-client';
import { PromptBuilder, SYSTEM_PROMPT } from './prompt-templates';
import {
  AnalysisInput,
  AnalysisResult,
  ChainConfig,
  ChainResult,
  ValidationError
} from './types';

/**
 * LLM-powered API analysis chain following Langchain patterns
 * Implements: Observe -> Think -> Act agent loop
 */
export class APIAnalyzerChain {
  private llmClient: LLMClient;
  private config: ChainConfig;

  constructor(config: ChainConfig) {
    this.llmClient = new LLMClient(config.llm);
    this.config = {
      ...config,
      maxRetries: config.maxRetries ?? 3,
      validationStrict: config.validationStrict ?? true,
      enableReflection: config.enableReflection ?? true
    };
  }

  /**
   * Main analysis workflow: Detect -> Analyze -> Suggest Fix
   */
  async analyze(input: AnalysisInput): Promise<ChainResult<AnalysisResult>> {
    const startTime = Date.now();
    let retryCount = 0;

    console.log('🔍 Starting LLM-powered root cause analysis...');
    console.log(`📊 Input: ${input.errorLogs.length} errors, ${input.schemaDiff.possibleRenames.length} potential renames`);

    while (retryCount <= this.config.maxRetries) {
      try {
        // Step 1: Observe (prepare analysis prompt)
        const analysisPrompt = this.buildAnalysisPrompt(input);

        // Step 2: Think (LLM analysis)
        const analysisResult = await this.performAnalysis(analysisPrompt, retryCount);

        // Step 3: Act (validate and enhance result)
        const validatedResult = await this.validateAndEnhance(analysisResult, input);

        const duration = Date.now() - startTime;

        console.log(`✅ Analysis completed successfully`);
        console.log(`🎯 Root cause: ${validatedResult.rootCause}`);
        console.log(`🔒 Confidence: ${(validatedResult.confidence * 100).toFixed(1)}%`);
        console.log(`⚡ Duration: ${duration}ms`);

        return {
          success: true,
          data: validatedResult,
          retryCount,
          duration
        };

      } catch (error) {
        retryCount++;
        console.warn(`❌ Analysis attempt ${retryCount} failed:`, error instanceof Error ? error.message : String(error));

        if (retryCount > this.config.maxRetries) {
          return {
            success: false,
            errors: [{ field: 'analysis', message: error instanceof Error ? error.message : String(error), received: null, expected: 'valid analysis' }],
            retryCount,
            duration: Date.now() - startTime
          };
        }

        // Exponential backoff before retry
        await this.sleep(Math.pow(2, retryCount) * 1000);
      }
    }

    return {
      success: false,
      errors: [{ field: 'analysis', message: 'Max retries exceeded', received: null, expected: 'valid analysis' }],
      retryCount,
      duration: Date.now() - startTime
    };
  }

  /**
   * Build the analysis prompt with proper context
   */
  private buildAnalysisPrompt(input: AnalysisInput): string {
    const prompt = PromptBuilder.buildRootCausePrompt(input);

    // Add system instructions
    return `${SYSTEM_PROMPT}\n\n${prompt}`;
  }

  /**
   * Perform the main LLM analysis with structured output parsing
   */
  private async performAnalysis(prompt: string, attemptNumber: number): Promise<AnalysisResult> {
    console.log(`🤖 Sending analysis request to LLM (attempt ${attemptNumber + 1})`);

    // Get LLM response
    const response = await this.llmClient.generateCompletion(prompt);

    console.log(`📝 LLM response received (${response.usage?.totalTokens || 'unknown'} tokens)`);

    // Parse JSON from response
    const parsedResult = this.llmClient.parseJSON<AnalysisResult>(response.content);

    // Validate required fields
    const requiredFields = [
      'rootCause',
      'confidence',
      'details',
      'suggestedFix',
      'reasoning'
    ];

    return this.llmClient.validateSchema<AnalysisResult>(parsedResult, requiredFields);
  }

  /**
   * Validate and enhance the analysis result
   */
  private async validateAndEnhance(result: AnalysisResult, input: AnalysisInput): Promise<AnalysisResult> {
    // Basic validation
    const validationErrors = this.validateAnalysisResult(result, input);

    if (validationErrors.length > 0 && this.config.validationStrict) {
      throw new Error(`Validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
    }

    // Optional: reflection step to improve analysis
    if (this.config.enableReflection && result.confidence < 0.8) {
      console.log('🔄 Low confidence detected, attempting reflection...');
      return await this.performReflection(result, input);
    }

    // Enhance with additional context
    return this.enhanceAnalysis(result, input);
  }

  /**
   * Validate analysis result against input data
   */
  private validateAnalysisResult(result: AnalysisResult, input: AnalysisInput): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check confidence is in valid range
    if (result.confidence < 0 || result.confidence > 1) {
      errors.push({
        field: 'confidence',
        message: 'Confidence must be between 0 and 1',
        received: result.confidence,
        expected: 'number between 0 and 1'
      });
    }

    // Check if suggested fix type is valid
    const validFixTypes = ['adapter', 'migration', 'rollback', 'schema-update'];
    if (!validFixTypes.includes(result.suggestedFix.type)) {
      errors.push({
        field: 'suggestedFix.type',
        message: 'Invalid fix type',
        received: result.suggestedFix.type,
        expected: validFixTypes.join(' | ')
      });
    }

    // Check if analysis mentions detected field renames
    const hasHighConfidenceRenames = input.schemaDiff.possibleRenames.some(r => r.confidence > 0.8);
    if (hasHighConfidenceRenames && !result.details.field) {
      errors.push({
        field: 'details.field',
        message: 'High confidence rename detected but not mentioned in analysis',
        received: result.details.field,
        expected: 'field name from schema diff'
      });
    }

    return errors;
  }

  /**
   * Perform reflection to improve low-confidence analysis
   */
  private async performReflection(result: AnalysisResult, input: AnalysisInput): Promise<AnalysisResult> {
    const reflectionFeedback = `
    Your analysis has low confidence (${result.confidence}). Please reconsider:

    1. Are you utilizing all available schema diff information?
    2. Do the error patterns clearly point to a specific cause?
    3. Is your suggested fix the most practical approach?

    Original detected renames: ${input.schemaDiff.possibleRenames.map(r =>
      `${r.from} -> ${r.to} (${(r.confidence * 100).toFixed(1)}%)`).join(', ')}
    `;

    const reflectionPrompt = PromptBuilder.buildReflectionPrompt(result, reflectionFeedback);

    try {
      const response = await this.llmClient.generateCompletion(reflectionPrompt);
      const improvedResult = this.llmClient.parseJSON<AnalysisResult>(response.content);

      console.log(`🔄 Reflection completed, confidence improved: ${result.confidence} -> ${improvedResult.confidence}`);

      return improvedResult;
    } catch (error) {
      console.warn('❌ Reflection failed, using original result:', error instanceof Error ? error.message : String(error));
      return result;
    }
  }

  /**
   * Enhance analysis with additional context and metadata
   */
  private enhanceAnalysis(result: AnalysisResult, input: AnalysisInput): AnalysisResult {
    // Add affected endpoints from input
    if (!result.details.affectedEndpoints) {
      result.details.affectedEndpoints = [input.metadata.endpoint];
    }

    // Adjust priority based on error rate
    if (input.metadata.errorRate > 0.5) {
      result.suggestedFix.priority = 'high';
    } else if (input.metadata.errorRate > 0.2) {
      result.suggestedFix.priority = 'medium';
    }

    // Add implementation context for adapter fixes
    if (result.suggestedFix.type === 'adapter' && result.details.field) {
      if (!result.suggestedFix.implementation.codeExample) {
        result.suggestedFix.implementation.codeExample = this.generateAdapterCode(
          result.details.field,
          result.details.newFieldName || 'unknown'
        );
      }
    }

    return result;
  }

  /**
   * Generate sample adapter code for field mapping
   */
  private generateAdapterCode(oldField: string, newField: string): string {
    return `// Adapter middleware for ${oldField} -> ${newField} mapping
app.use('/api/signup', (req, res, next) => {
  if (req.body.${oldField} && !req.body.${newField}) {
    req.body.${newField} = req.body.${oldField};
    delete req.body.${oldField};
  }
  next();
});`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function for creating analyzer chain with common configurations
 */
export function createAnalyzerChain(config: Partial<ChainConfig>): APIAnalyzerChain {
  const defaultConfig: ChainConfig = {
    llm: {
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      temperature: 0.1,
      maxTokens: 2000
    },
    maxRetries: 3,
    validationStrict: true,
    enableReflection: true
  };

  return new APIAnalyzerChain({ ...defaultConfig, ...config });
}

/**
 * Quick analysis function for simple use cases
 */
export async function analyzeAPIFailure(
  input: AnalysisInput,
  options?: Partial<ChainConfig>
): Promise<AnalysisResult> {
  const chain = createAnalyzerChain(options || {});
  const result = await chain.analyze(input);

  if (!result.success) {
    throw new Error(`Analysis failed: ${result.errors?.map(e => e.message).join(', ')}`);
  }

  return result.data!;
}