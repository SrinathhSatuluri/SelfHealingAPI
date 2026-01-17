import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'SelfHealingAPI - Enterprise-grade automatic API error detection, analysis and healing system',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      signup: '/api/signup',
      monitoring: '/api/monitoring'
    },
    timestamp: new Date().toISOString()
  });
}