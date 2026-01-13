import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RequestEvent, ResponseEvent, ErrorEvent, DetectionConfig } from './types';
import { EventCollector } from './collector';
import { SchemaDetector } from './detector';
import { APIAnalyzerChain, createAnalysisInput, CommonConfigurations } from '../../analyzer';

/**
 * Self-healing API detection middleware
 * Follows Sentry SDK pattern for instrumentation
 */
export class SelfHealingMiddleware {
  private collector: EventCollector;
  private schemaDetector: SchemaDetector;
  private config: DetectionConfig;
  private analyzer?: APIAnalyzerChain;
  private lastAnalysisTime: number = 0;
  private analysisInProgress: boolean = false;

  constructor(config: Partial<DetectionConfig> = {}) {
    this.config = {
      errorRateThreshold: 0.1, // 10%
      successRateThreshold: 0.9, // 90%
      responseTimeThreshold: 5000, // 5 seconds
      windowSize: '5m',
      schemaValidation: true,
      enableAlerts: true,
      ...config
    };

    this.collector = new EventCollector();
    this.schemaDetector = new SchemaDetector();

    // Initialize LLM analyzer if API key is available
    if (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) {
      this.analyzer = new APIAnalyzerChain(CommonConfigurations.quickAnalysis);
      console.log('🧠 LLM-powered analysis enabled');
    } else {
      console.log('💡 Add ANTHROPIC_API_KEY or OPENAI_API_KEY to enable LLM analysis');
    }
  }

  /**
   * Express middleware for request/response tracking
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = randomUUID();
      const startTime = Date.now();

      // Attach request ID for correlation
      req.requestId = requestId;

      // Capture request event
      const requestEvent: RequestEvent = {
        id: requestId,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: req.headers as Record<string, string>,
        body: req.body,
        userAgent: req.get('User-Agent')
      };

      this.collector.collectRequest(requestEvent);

      // Schema validation for POST/PUT requests
      if (this.config.schemaValidation && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        this.schemaDetector.analyzeRequest(requestEvent);
      }

      // Capture response
      const originalSend = res.send;
      const collector = this.collector;
      const schemaDetector = this.schemaDetector;
      const config = this.config;

      res.send = function(body: any) {
        const endTime = Date.now();
        const duration = endTime - startTime;

        const responseEvent: ResponseEvent = {
          id: requestId,
          timestamp: new Date().toISOString(),
          statusCode: res.statusCode,
          headers: res.getHeaders() as Record<string, string>,
          body: typeof body === 'string' ? JSON.parse(body) : body,
          duration,
          success: res.statusCode >= 200 && res.statusCode < 400
        };

        // Collect response event
        collector.collectResponse(responseEvent);

        // Schema validation for error responses
        if (!responseEvent.success && config.schemaValidation) {
          schemaDetector.analyzeResponse(requestEvent, responseEvent);
        }

        // Trigger LLM analysis if conditions are met
        this.checkAndTriggerAnalysis(requestEvent, responseEvent);

        return originalSend.call(this, body);
      };

      // Error handling
      res.on('error', (error: Error) => {
        const errorEvent: ErrorEvent = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'server',
          message: error.message,
          stack: error.stack,
          requestId,
          statusCode: res.statusCode
        };

        collector.collectError(errorEvent);
      });

      next();
    };
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    return this.collector.getMetrics();
  }

  /**
   * Get recent alerts
   */
  getAlerts() {
    return this.collector.getAlerts();
  }

  /**
   * Get detected schema issues
   */
  getSchemaIssues() {
    return this.schemaDetector.getDetectedIssues();
  }

  /**
   * Check if LLM analysis should be triggered and do it
   */
  private checkAndTriggerAnalysis = (requestEvent: RequestEvent, responseEvent: ResponseEvent) => {
    if (!this.analyzer || this.analysisInProgress) {
      return;
    }

    // Don't analyze too frequently (max once per 30 seconds)
    const now = Date.now();
    if (now - this.lastAnalysisTime < 30000) {
      return;
    }

    const metrics = this.collector.getMetrics();

    // Trigger analysis if error rate is high
    const shouldAnalyze =
      metrics.errorRate > this.config.errorRateThreshold ||
      metrics.successRate < this.config.successRateThreshold ||
      this.schemaDetector.getDetectedIssues().length > 0;

    if (shouldAnalyze) {
      this.triggerLLMAnalysis(requestEvent.url);
    }
  }

  /**
   * Trigger LLM-powered root cause analysis
   */
  private async triggerLLMAnalysis(endpoint: string) {
    if (!this.analyzer || this.analysisInProgress) {
      return;
    }

    this.analysisInProgress = true;
    this.lastAnalysisTime = Date.now();

    try {
      console.log('\n🧠 Triggering LLM-powered root cause analysis...');

      // Gather data for analysis
      const metrics = this.collector.getMetrics();
      const recentErrors = this.collector.getRecentErrors(10);
      const schemaIssues = this.schemaDetector.getDetectedIssues(5);
      const renameSuggestions = this.schemaDetector.getFieldRenameSuggestions();

      // Create analysis input
      const analysisInput = createAnalysisInput(
        recentErrors,
        {
          missingFields: schemaIssues.flatMap(s => s.missingFields),
          extraFields: schemaIssues.flatMap(s => s.extraFields),
          possibleRenames: schemaIssues.flatMap(s => s.possibleRenames)
        },
        endpoint,
        metrics.errorRate
      );

      // Run LLM analysis
      const result = await this.analyzer.analyze(analysisInput);

      if (result.success && result.data) {
        console.log('\n🎯 LLM ROOT CAUSE ANALYSIS COMPLETE:');
        console.log('='.repeat(60));
        console.log(`🔍 Root Cause: ${result.data.rootCause}`);
        console.log(`📊 Confidence: ${(result.data.confidence * 100).toFixed(1)}%`);
        console.log(`🔧 Suggested Fix: ${result.data.suggestedFix.description}`);
        console.log(`⚡ Priority: ${result.data.suggestedFix.priority.toUpperCase()}`);

        if (result.data.details.field && result.data.details.newFieldName) {
          console.log(`📋 Field Mapping: ${result.data.details.field} → ${result.data.details.newFieldName}`);
        }

        if (result.data.suggestedFix.implementation.codeExample) {
          console.log('\n💡 Code Example:');
          console.log(result.data.suggestedFix.implementation.codeExample);
        }

        console.log('\n🔄 Implementation Steps:');
        result.data.suggestedFix.implementation.steps.forEach((step, i) => {
          console.log(`   ${i + 1}. ${step}`);
        });

        console.log('='.repeat(60));

        // Store analysis result for API access
        this.collector.storeAnalysisResult(result.data);

      } else {
        console.log(`❌ LLM analysis failed: ${result.errors?.map(e => e.message).join(', ')}`);
      }

    } catch (error) {
      console.log(`❌ LLM analysis error: ${error.message}`);
    } finally {
      this.analysisInProgress = false;
    }
  }

  /**
   * Get latest LLM analysis results
   */
  getAnalysisResults() {
    return this.collector.getAnalysisResults();
  }

  /**
   * Enable LLM analysis with custom configuration
   */
  enableLLMAnalysis(apiKey: string, provider: 'anthropic' | 'openai' = 'anthropic') {
    const config = provider === 'anthropic'
      ? { ...CommonConfigurations.quickAnalysis, llm: { ...CommonConfigurations.quickAnalysis.llm, apiKey } }
      : { ...CommonConfigurations.openaiAnalysis, llm: { ...CommonConfigurations.openaiAnalysis.llm, apiKey } };

    this.analyzer = new APIAnalyzerChain(config);
    console.log(`🧠 LLM analysis enabled with ${provider}`);
  }
}

// Extend Express Request type to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}