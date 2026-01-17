import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Mock monitoring data for demo purposes
  const mockMetrics = {
    totalRequests: Math.floor(Math.random() * 1000) + 100,
    successRate: (Math.random() * 0.2 + 0.8).toFixed(3), // 80-100%
    errorRate: (Math.random() * 0.1).toFixed(3), // 0-10%
    averageResponseTime: Math.floor(Math.random() * 100) + 50, // 50-150ms
    lastUpdated: new Date().toISOString()
  };

  const mockAlerts = [
    {
      id: 'alert_001',
      type: 'schema_mismatch',
      severity: 'medium',
      message: 'Schema mismatch detected: expected "phone" field, received "phoneNumber"',
      timestamp: new Date().toISOString()
    }
  ];

  const mockSchemaIssues = [
    {
      endpoint: '/api/signup',
      expected: { phone: 'string' },
      received: { phoneNumber: 'string' },
      count: Math.floor(Math.random() * 50) + 1,
      lastSeen: new Date().toISOString()
    }
  ];

  const mockAnalysisResults = [
    {
      id: 'analysis_001',
      issue: 'Field name mismatch',
      confidence: 0.95,
      suggestedFix: 'Map phoneNumber to phone field',
      status: 'pending_approval',
      timestamp: new Date().toISOString()
    }
  ];

  res.status(200).json({
    metrics: mockMetrics,
    alerts: mockAlerts,
    schemaIssues: mockSchemaIssues,
    analysisResults: mockAnalysisResults,
    timestamp: new Date().toISOString(),
    note: 'This is mock data for demo purposes on Vercel'
  });
}