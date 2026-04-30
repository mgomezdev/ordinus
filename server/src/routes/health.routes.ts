import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiResponse, HealthResponse, ReadyResponse } from '@gridfinity/shared';
import { client } from '../db/connection.js';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const body: ApiResponse<HealthResponse> = {
    data: {
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
    },
  };
  res.json(body);
});

router.get('/health/ready', async (_req: Request, res: Response) => {
  try {
    await client.execute('SELECT 1');

    const body: ApiResponse<ReadyResponse> = {
      data: {
        status: 'ok',
        db: 'connected',
      },
    };
    res.json(body);
  } catch {
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database connection failed',
      },
    });
  }
});

export default router;
