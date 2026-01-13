/**
 * Types for self-healing API detection system
 */

export interface RequestEvent {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  userAgent?: string;
}

export interface ResponseEvent {
  id: string;
  timestamp: string;
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  duration: number;
  success: boolean;
}

export interface ErrorEvent {
  id: string;
  timestamp: string;
  type: 'validation' | 'server' | 'timeout' | 'unknown';
  message: string;
  stack?: string;
  requestId: string;
  statusCode?: number;
}

export interface SchemaFieldEvent {
  requestId: string;
  timestamp: string;
  endpoint: string;
  expectedFields: string[];
  providedFields: string[];
  missingFields: string[];
  extraFields: string[];
  possibleRenames: Array<{
    from: string;
    to: string;
    confidence: number;
  }>;
}

export interface MetricSnapshot {
  timestamp: string;
  timeWindow: string; // e.g., "5m", "1h"
  totalRequests: number;
  successfulRequests: number;
  errorRequests: number;
  successRate: number;
  errorRate: number;
  averageResponseTime: number;
  statusCodeCounts: Record<string, number>;
}

export interface Alert {
  id: string;
  timestamp: string;
  type: 'error_spike' | 'success_rate_drop' | 'schema_mismatch' | 'performance_degradation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: any;
  affectedEndpoint: string;
  suggestedAction?: string;
}

export interface DetectionConfig {
  errorRateThreshold: number; // e.g., 0.1 for 10%
  successRateThreshold: number; // e.g., 0.9 for 90%
  responseTimeThreshold: number; // in milliseconds
  windowSize: string; // e.g., "5m", "10m"
  schemaValidation: boolean;
  enableAlerts: boolean;
}