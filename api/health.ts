import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    status: 'healthy',
    version: 'v1',
    timestamp: new Date().toISOString(),
    environment: 'vercel'
  });
}