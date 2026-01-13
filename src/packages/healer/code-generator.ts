import { LLMClient } from '../analyzer/llm-client';
import { TEMPLATES, TEMPLATE_METADATA } from './templates/adapter-middleware';
import { AnalysisResult, GeneratedCode, HealerConfig } from './types';
import { randomUUID } from 'crypto';

/**
 * LLM-powered code generator for self-healing fixes
 * Follows Aider pattern: iterative refinement with validation feedback
 */
export class CodeGenerator {
  private llmClient: LLMClient;
  private config: HealerConfig;

  constructor(config: HealerConfig) {
    this.config = config;
    this.llmClient = new LLMClient(config.generation.llm);
  }

  /**
   * Generate middleware code from analysis result
   */
  async generateFix(analysis: AnalysisResult): Promise<GeneratedCode> {
    const fixType = this.determineFixType(analysis);

    console.log(`🛠️ Generating ${fixType} middleware for: ${analysis.rootCause}`);

    // Try template-based generation first (fast & reliable)
    if (this.config.generation.templates.enabled) {
      const templateResult = this.generateFromTemplate(analysis, fixType);
      if (templateResult) {
        console.log('✅ Generated code using template');
        return templateResult;
      }
    }

    // Fallback to LLM generation (more flexible)
    console.log('🤖 Falling back to LLM generation...');
    return await this.generateWithLLM(analysis, fixType);
  }

  /**
   * Generate code using templates (fast, predictable)
   */
  private generateFromTemplate(analysis: AnalysisResult, fixType: string): GeneratedCode | null {
    const template = TEMPLATES[fixType as keyof typeof TEMPLATES];
    if (!template) return null;

    try {
      const variables = this.extractTemplateVariables(analysis, fixType);
      const generatedCode = this.renderTemplate(template, variables);

      return {
        id: randomUUID(),
        content: generatedCode,
        type: 'middleware',
        description: `Template-generated ${fixType} middleware: ${analysis.details.field} -> ${analysis.details.newFieldName}`,
        metadata: {
          generatedAt: new Date().toISOString(),
          fixType,
          targetField: analysis.details.newFieldName,
          sourceField: analysis.details.field,
          confidence: 0.95 // Templates have high confidence
        }
      };
    } catch (error) {
      console.warn('Template generation failed:', error.message);
      return null;
    }
  }

  /**
   * Generate code using LLM (flexible, handles edge cases)
   */
  private async generateWithLLM(analysis: AnalysisResult, fixType: string): Promise<GeneratedCode> {
    const prompt = this.buildCodeGenerationPrompt(analysis, fixType);

    let attempts = 0;
    const maxAttempts = this.config.generation.llm.retryAttempts;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`🤖 LLM generation attempt ${attempts}/${maxAttempts}`);

        const response = await this.llmClient.generateCompletion(prompt);
        const generatedCode = this.extractCodeFromResponse(response.content);

        return {
          id: randomUUID(),
          content: generatedCode,
          type: 'middleware',
          description: `LLM-generated ${fixType} middleware: ${analysis.rootCause}`,
          metadata: {
            generatedAt: new Date().toISOString(),
            fixType,
            targetField: analysis.details.newFieldName,
            sourceField: analysis.details.field,
            confidence: Math.max(0.7, analysis.confidence - 0.1) // Slightly lower confidence for LLM
          }
        };

      } catch (error) {
        console.warn(`LLM generation attempt ${attempts} failed:`, error.message);

        if (attempts < maxAttempts) {
          // Add error feedback to prompt for next attempt
          const refinedPrompt = this.refinePromptWithError(prompt, error.message);
          console.log('🔄 Refining prompt with error feedback...');
        }
      }
    }

    throw new Error(`Failed to generate code after ${maxAttempts} attempts`);
  }

  /**
   * Determine the type of fix needed based on analysis
   */
  private determineFixType(analysis: AnalysisResult): string {
    if (analysis.suggestedFix.type === 'adapter') {
      return 'adapter';
    } else if (analysis.rootCause.includes('validation') || analysis.rootCause.includes('required')) {
      return 'validation';
    } else if (analysis.suggestedFix.description.includes('transform')) {
      return 'transformation';
    }

    return 'adapter'; // Default fallback
  }

  /**
   * Extract variables needed for template rendering
   */
  private extractTemplateVariables(analysis: AnalysisResult, fixType: string): Record<string, any> {
    const baseVars = {
      functionName: this.generateFunctionName(analysis),
      description: `Fix for: ${analysis.rootCause}`,
      timestamp: new Date().toISOString(),
      sourceField: analysis.details.field || 'unknown',
      targetField: analysis.details.newFieldName || 'unknown'
    };

    switch (fixType) {
      case 'adapter':
        return baseVars;

      case 'validation':
        return {
          ...baseVars,
          requiredFields: [analysis.details.newFieldName || 'unknown'],
          fieldValidations: []
        };

      case 'transformation':
        return {
          ...baseVars,
          transformations: [{
            sourceField: analysis.details.field,
            targetField: analysis.details.newFieldName,
            removeSource: true
          }]
        };

      default:
        return baseVars;
    }
  }

  /**
   * Render template with variables (simple string replacement)
   */
  private renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;

    // Replace simple variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, String(value));
    });

    // Handle arrays (basic support)
    Object.entries(variables).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        const listRegex = new RegExp(`{{#${key}}}(.+?){{/${key}}}`, 'gs');
        rendered = rendered.replace(listRegex, (match, content) => {
          return value.map(item => content.replace(/{{\.}}/g, item)).join('');
        });
      }
    });

    return rendered;
  }

  /**
   * Build LLM prompt for code generation
   */
  private buildCodeGenerationPrompt(analysis: AnalysisResult, fixType: string): string {
    return `You are an expert TypeScript developer generating Express middleware to fix API schema issues.

ANALYSIS:
Root Cause: ${analysis.rootCause}
Confidence: ${(analysis.confidence * 100).toFixed(1)}%
Field Mapping: ${analysis.details.field} -> ${analysis.details.newFieldName}
Fix Type: ${fixType}

REQUIREMENTS:
1. Generate a TypeScript Express middleware function
2. Use proper Express types: (req: Request, res: Response, next: NextFunction)
3. Handle the field mapping: ${analysis.details.field} -> ${analysis.details.newFieldName}
4. Include error handling with try/catch
5. Call next() to continue the middleware chain
6. Add logging for debugging
7. Export the function

TEMPLATE STRUCTURE:
\`\`\`typescript
import { Request, Response, NextFunction } from 'express';

export function generatedMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Your field mapping logic here
    if (req.body && req.body.${analysis.details.field}) {
      req.body.${analysis.details.newFieldName} = req.body.${analysis.details.field};
      delete req.body.${analysis.details.field};
    }
    next();
  } catch (error) {
    console.error('Middleware error:', error);
    next(error);
  }
}
\`\`\`

SECURITY RULES:
- No eval() or Function() calls
- No dynamic require() or import()
- No file system operations
- No network calls
- Only manipulate req.body safely

Generate the complete middleware function following this structure.`;
  }

  /**
   * Extract code from LLM response (handle markdown, etc.)
   */
  private extractCodeFromResponse(response: string): string {
    // Try to extract from code blocks
    const codeBlockMatch = response.match(/```(?:typescript|ts)?\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to extract export function
    const functionMatch = response.match(/(export\s+function[\s\S]*)/);
    if (functionMatch) {
      return functionMatch[1].trim();
    }

    // Fallback: return the response as-is and let validation catch issues
    return response.trim();
  }

  /**
   * Refine prompt with error feedback for retry attempts
   */
  private refinePromptWithError(originalPrompt: string, errorMessage: string): string {
    return `${originalPrompt}

PREVIOUS ATTEMPT FAILED WITH ERROR:
${errorMessage}

Please fix the issue and generate valid TypeScript middleware code.

COMMON FIXES:
- Ensure all imports are included
- Use proper TypeScript syntax
- Follow Express middleware signature exactly
- Include proper error handling`;
  }

  /**
   * Generate a unique function name based on the analysis
   */
  private generateFunctionName(analysis: AnalysisResult): string {
    const baseName = analysis.details.field && analysis.details.newFieldName
      ? `map${this.capitalize(analysis.details.field)}To${this.capitalize(analysis.details.newFieldName)}`
      : 'generatedMiddleware';

    const timestamp = Date.now().toString().slice(-6);
    return `${baseName}_${timestamp}`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}