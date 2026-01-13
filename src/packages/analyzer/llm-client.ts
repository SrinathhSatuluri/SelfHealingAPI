import { LLMConfig, LLMResponse } from './types';

/**
 * Unified LLM client supporting OpenAI and Anthropic APIs
 * Follows the adapter pattern for consistent interface
 */
export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = {
      temperature: 0.1, // Low temperature for consistent JSON output
      maxTokens: 2000,
      retryAttempts: 3,
      timeout: 30000,
      ...config
    };
  }

  /**
   * Generate completion with automatic retries
   */
  async generateCompletion(prompt: string): Promise<LLMResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts!; attempt++) {
      try {
        console.log(`🤖 LLM Request (attempt ${attempt}/${this.config.retryAttempts})`);

        if (this.config.provider === 'anthropic') {
          return await this.callClaude(prompt);
        } else {
          return await this.callOpenAI(prompt);
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`❌ LLM attempt ${attempt} failed:`, error instanceof Error ? error.message : String(error));

        if (attempt < this.config.retryAttempts!) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`LLM request failed after ${this.config.retryAttempts} attempts. Last error: ${lastError!.message}`);
  }

  /**
   * Call Claude API
   */
  private async callClaude(prompt: string): Promise<LLMResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    return {
      content: data.content[0].text,
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      finishReason: data.stop_reason || 'unknown'
    };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string): Promise<LLMResponse> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const message = data.choices[0].message;

    return {
      content: message.content,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      finishReason: data.choices[0].finish_reason || 'unknown'
    };
  }

  /**
   * Parse JSON from LLM output with error handling
   */
  parseJSON<T>(content: string): T {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      // Try to extract JSON from the content directly
      const startIdx = content.indexOf('{');
      const lastIdx = content.lastIndexOf('}');

      if (startIdx !== -1 && lastIdx !== -1) {
        const jsonStr = content.slice(startIdx, lastIdx + 1);
        return JSON.parse(jsonStr);
      }

      // Fallback: assume entire content is JSON
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse JSON from LLM output: ${error instanceof Error ? error.message : String(error)}\n\nContent: ${content}`);
    }
  }

  /**
   * Validate JSON structure matches expected schema
   */
  validateSchema<T>(data: any, requiredFields: string[]): T {
    const errors: string[] = [];

    for (const field of requiredFields) {
      if (!(field in data) || data[field] === undefined || data[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Schema validation failed:\n${errors.join('\n')}`);
    }

    return data as T;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create LLM client with common configurations
 */
export function createLLMClient(config: Partial<LLMConfig>): LLMClient {
  // Default to Claude if no provider specified
  const defaultConfig: LLMConfig = {
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    temperature: 0.1,
    maxTokens: 2000,
    retryAttempts: 3,
    timeout: 30000
  };

  // Override with OpenAI defaults if specified
  if (config.provider === 'openai') {
    defaultConfig.model = 'gpt-4';
    defaultConfig.apiKey = process.env.OPENAI_API_KEY || '';
  }

  return new LLMClient({ ...defaultConfig, ...config });
}