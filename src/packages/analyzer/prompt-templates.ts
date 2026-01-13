import { AnalysisInput } from './types';

/**
 * Prompt templates for LLM-powered root cause analysis
 * Following prompt engineering best practices for structured output
 */

export const SYSTEM_PROMPT = `You are an expert API debugging assistant specialized in analyzing API failures and schema mismatches.

Your role is to:
1. Analyze error patterns in API request/response data
2. Identify root causes of API failures
3. Suggest practical fixes with implementation details
4. Provide confidence levels for your analysis

You MUST respond with valid JSON only. No markdown, explanations, or other text.`;

export const ROOT_CAUSE_ANALYSIS_TEMPLATE = `
Analyze this API failure and provide a detailed root cause analysis.

## Context
API Endpoint: {endpoint}
Error Rate: {errorRate}%
Success Rate: {successRate}%
Timestamp: {timestamp}

## Error Logs
{errorLogs}

## Schema Information
Expected Request Schema: {requestSchema}
Expected Response Schema: {responseSchema}

## Detected Schema Differences
Missing Fields: {missingFields}
Extra Fields: {extraFields}
Possible Field Renames: {possibleRenames}

## Analysis Instructions
1. Examine the error patterns and schema differences
2. Identify the most likely root cause
3. Assess confidence level (0.0 to 1.0)
4. Suggest a practical fix with implementation details
5. Provide step-by-step reasoning

## Response Format
Respond with this exact JSON structure:
{
  "rootCause": "Brief description of the root cause",
  "confidence": 0.95,
  "details": {
    "field": "fieldName",
    "expectedBy": "backend",
    "newFieldName": "newFieldName",
    "breakingChange": true,
    "affectedEndpoints": ["/api/signup"]
  },
  "suggestedFix": {
    "type": "adapter",
    "description": "Detailed description of the fix",
    "implementation": {
      "strategy": "Create adapter middleware",
      "codeExample": "// TypeScript code example",
      "steps": ["Step 1", "Step 2", "Step 3"]
    },
    "priority": "high",
    "estimatedImpact": {
      "downtime": "None - hot deployment",
      "complexity": "low",
      "riskLevel": "low"
    }
  },
  "reasoning": [
    "Analysis step 1",
    "Analysis step 2",
    "Analysis step 3"
  ]
}
`;

export const VALIDATION_PROMPT = `
Review this analysis result for accuracy and completeness.

Original Analysis:
{originalAnalysis}

Original Data:
{originalData}

Validation Instructions:
1. Check if the root cause makes sense given the data
2. Verify the suggested fix is practical
3. Ensure confidence level is appropriate
4. Validate JSON structure is complete

Respond with either:
- "VALID" if the analysis is good
- Updated JSON if corrections are needed
`;

export class PromptBuilder {
  /**
   * Build root cause analysis prompt from input data
   */
  static buildRootCausePrompt(input: AnalysisInput): string {
    const errorLogsText = input.errorLogs
      .slice(0, 5) // Limit to recent errors
      .map(log => `[${log.timestamp}] ${log.method} ${log.url} -> ${log.statusCode}
Request: ${JSON.stringify(log.requestBody, null, 2)}
Response: ${JSON.stringify(log.responseBody, null, 2)}
Error: ${log.errorMessage}`)
      .join('\n\n');

    const requestSchemaText = JSON.stringify(input.requestSchema, null, 2);
    const responseSchemaText = JSON.stringify(input.responseSchema, null, 2);

    const missingFieldsText = input.schemaDiff.missingFields.length > 0
      ? input.schemaDiff.missingFields.join(', ')
      : 'None';

    const extraFieldsText = input.schemaDiff.extraFields.length > 0
      ? input.schemaDiff.extraFields.join(', ')
      : 'None';

    const renamesText = input.schemaDiff.possibleRenames.length > 0
      ? input.schemaDiff.possibleRenames
          .map(r => `${r.from} -> ${r.to} (confidence: ${r.confidence})`)
          .join(', ')
      : 'None detected';

    return ROOT_CAUSE_ANALYSIS_TEMPLATE
      .replace('{endpoint}', input.metadata.endpoint)
      .replace('{errorRate}', input.metadata.errorRate.toString())
      .replace('{successRate}', input.metadata.successRate.toString())
      .replace('{timestamp}', input.metadata.timestamp)
      .replace('{errorLogs}', errorLogsText)
      .replace('{requestSchema}', requestSchemaText)
      .replace('{responseSchema}', responseSchemaText)
      .replace('{missingFields}', missingFieldsText)
      .replace('{extraFields}', extraFieldsText)
      .replace('{possibleRenames}', renamesText);
  }

  /**
   * Build validation prompt for checking analysis quality
   */
  static buildValidationPrompt(originalAnalysis: any, originalData: AnalysisInput): string {
    return VALIDATION_PROMPT
      .replace('{originalAnalysis}', JSON.stringify(originalAnalysis, null, 2))
      .replace('{originalData}', JSON.stringify({
        endpoint: originalData.metadata.endpoint,
        errorCount: originalData.errorLogs.length,
        schemaDiff: originalData.schemaDiff
      }, null, 2));
  }

  /**
   * Build prompt for fix generation
   */
  static buildFixGenerationPrompt(rootCause: string, context: any): string {
    return `Based on this root cause analysis, generate detailed fix implementation:

Root Cause: ${rootCause}
Context: ${JSON.stringify(context, null, 2)}

Focus on:
1. Practical implementation steps
2. Code examples in TypeScript
3. Risk mitigation strategies
4. Testing recommendations

Respond with JSON containing detailed implementation guidance.`;
  }

  /**
   * Build reflection prompt for self-correction
   */
  static buildReflectionPrompt(analysis: any, feedback: string): string {
    return `Review and improve this analysis based on feedback:

Current Analysis:
${JSON.stringify(analysis, null, 2)}

Feedback:
${feedback}

Provide an improved version addressing the feedback points.`;
  }
}

/**
 * Common prompt fragments for reuse
 */
export const PromptFragments = {
  jsonInstructions: 'Respond with valid JSON only. No explanations outside the JSON.',

  confidenceGuideline: `Confidence levels:
- 0.9-1.0: Very high confidence, clear evidence
- 0.7-0.9: High confidence, strong indicators
- 0.5-0.7: Medium confidence, some uncertainty
- 0.3-0.5: Low confidence, multiple possibilities
- 0.0-0.3: Very low confidence, insufficient data`,

  fixTypeGuideline: `Fix types:
- "adapter": Create middleware to transform requests/responses
- "migration": Gradual schema migration with versioning
- "rollback": Revert to previous working version
- "schema-update": Update schema definition and validation`,

  priorityGuideline: `Priority levels:
- "high": Critical issue affecting user experience
- "medium": Important but not blocking
- "low": Nice to have improvement`,

  exampleAnalysis: `Example analysis structure:
{
  "rootCause": "API schema mismatch - field renamed",
  "confidence": 0.95,
  "details": {
    "field": "phone",
    "expectedBy": "backend",
    "newFieldName": "phoneNumber",
    "breakingChange": true
  },
  "suggestedFix": {
    "type": "adapter",
    "description": "Create middleware to map old field names to new ones"
  }
}`
};