import { RequestEvent, ResponseEvent, ErrorEvent, MetricSnapshot, Alert } from './types';

/**
 * Event collection pipeline: Collect → Aggregate → Alert
 * Follows Datadog agent pattern for metrics collection
 */
export class EventCollector {
  private requests: RequestEvent[] = [];
  private responses: ResponseEvent[] = [];
  private errors: ErrorEvent[] = [];
  private alerts: Alert[] = [];
  private analysisResults: any[] = [];
  private maxEvents = 1000; // Keep last 1000 events in memory

  collectRequest(event: RequestEvent) {
    this.requests.push(event);
    this.trimEvents();
  }

  collectResponse(event: ResponseEvent) {
    this.responses.push(event);
    this.trimEvents();
    this.checkForAlerts(event);
  }

  collectError(event: ErrorEvent) {
    this.errors.push(event);
    this.trimEvents();
  }

  private trimEvents() {
    if (this.requests.length > this.maxEvents) {
      this.requests = this.requests.slice(-this.maxEvents);
    }
    if (this.responses.length > this.maxEvents) {
      this.responses = this.responses.slice(-this.maxEvents);
    }
    if (this.errors.length > this.maxEvents) {
      this.errors = this.errors.slice(-this.maxEvents);
    }
  }

  /**
   * Generate metrics snapshot for the last time window
   */
  getMetrics(windowMinutes: number = 5): MetricSnapshot {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const recentResponses = this.responses.filter(r =>
      new Date(r.timestamp) >= windowStart
    );

    const totalRequests = recentResponses.length;
    const successfulRequests = recentResponses.filter(r => r.success).length;
    const errorRequests = totalRequests - successfulRequests;

    const statusCodeCounts = recentResponses.reduce((acc, r) => {
      acc[r.statusCode.toString()] = (acc[r.statusCode.toString()] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const averageResponseTime = recentResponses.length > 0
      ? recentResponses.reduce((sum, r) => sum + r.duration, 0) / recentResponses.length
      : 0;

    return {
      timestamp: new Date().toISOString(),
      timeWindow: `${windowMinutes}m`,
      totalRequests,
      successfulRequests,
      errorRequests,
      successRate: totalRequests > 0 ? successfulRequests / totalRequests : 1,
      errorRate: totalRequests > 0 ? errorRequests / totalRequests : 0,
      averageResponseTime,
      statusCodeCounts
    };
  }

  /**
   * Check for alert conditions and generate alerts
   */
  private checkForAlerts(responseEvent: ResponseEvent) {
    const metrics = this.getMetrics();

    // Error rate spike alert
    if (metrics.errorRate > 0.1 && metrics.totalRequests > 10) {
      this.generateAlert({
        type: 'error_spike',
        severity: metrics.errorRate > 0.3 ? 'critical' : 'high',
        message: `Error rate spike detected: ${(metrics.errorRate * 100).toFixed(1)}%`,
        details: {
          errorRate: metrics.errorRate,
          totalRequests: metrics.totalRequests,
          errorRequests: metrics.errorRequests,
          timeWindow: metrics.timeWindow
        },
        affectedEndpoint: responseEvent.id, // This should be the endpoint path
        suggestedAction: 'Check recent deployments and schema changes'
      });
    }

    // Success rate drop alert
    if (metrics.successRate < 0.9 && metrics.totalRequests > 10) {
      this.generateAlert({
        type: 'success_rate_drop',
        severity: metrics.successRate < 0.7 ? 'critical' : 'high',
        message: `Success rate dropped to ${(metrics.successRate * 100).toFixed(1)}%`,
        details: {
          successRate: metrics.successRate,
          totalRequests: metrics.totalRequests,
          timeWindow: metrics.timeWindow
        },
        affectedEndpoint: responseEvent.id,
        suggestedAction: 'Investigate request/response schema mismatches'
      });
    }

    // Performance degradation alert
    if (metrics.averageResponseTime > 5000) {
      this.generateAlert({
        type: 'performance_degradation',
        severity: metrics.averageResponseTime > 10000 ? 'high' : 'medium',
        message: `Average response time increased to ${metrics.averageResponseTime.toFixed(0)}ms`,
        details: {
          averageResponseTime: metrics.averageResponseTime,
          timeWindow: metrics.timeWindow
        },
        affectedEndpoint: responseEvent.id,
        suggestedAction: 'Check database queries and external service calls'
      });
    }
  }

  private generateAlert(alertData: Omit<Alert, 'id' | 'timestamp'>) {
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...alertData
    };

    this.alerts.push(alert);

    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }

    console.warn(`🚨 ALERT: ${alert.message}`, alert);
  }

  getAlerts(limit: number = 10): Alert[] {
    return this.alerts.slice(-limit).reverse();
  }

  getRecentEvents(minutes: number = 5) {
    const windowStart = new Date(Date.now() - minutes * 60 * 1000);

    return {
      requests: this.requests.filter(r => new Date(r.timestamp) >= windowStart),
      responses: this.responses.filter(r => new Date(r.timestamp) >= windowStart),
      errors: this.errors.filter(r => new Date(r.timestamp) >= windowStart)
    };
  }

  /**
   * Get recent errors for LLM analysis
   */
  getRecentErrors(limit: number = 10): any[] {
    // Combine error events with failed responses
    const failedResponses = this.responses
      .filter(r => !r.success)
      .slice(-limit)
      .map(r => {
        const matchingRequest = this.requests.find(req => req.id === r.id);
        return {
          timestamp: r.timestamp,
          statusCode: r.statusCode,
          method: matchingRequest?.method || 'UNKNOWN',
          url: matchingRequest?.url || '/unknown',
          requestBody: matchingRequest?.body || {},
          responseBody: r.body || {},
          errorMessage: r.body?.error || r.body?.message || `HTTP ${r.statusCode} error`
        };
      });

    const errorEvents = this.errors.slice(-limit).map(e => ({
      timestamp: e.timestamp,
      statusCode: e.statusCode || 500,
      method: 'UNKNOWN',
      url: '/unknown',
      requestBody: {},
      responseBody: { error: e.message },
      errorMessage: e.message
    }));

    return [...failedResponses, ...errorEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Store LLM analysis result
   */
  storeAnalysisResult(result: any) {
    this.analysisResults.push({
      ...result,
      timestamp: new Date().toISOString()
    });

    // Keep only recent analysis results (last 50)
    if (this.analysisResults.length > 50) {
      this.analysisResults = this.analysisResults.slice(-50);
    }
  }

  /**
   * Get stored analysis results
   */
  getAnalysisResults(limit: number = 10): any[] {
    return this.analysisResults.slice(-limit).reverse();
  }
}