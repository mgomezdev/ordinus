import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/**
 * Auth endpoints: 10 requests per 15 minutes per IP.
 * Protects login/register from brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip ?? 'unknown',
  skip: () => isTest,
  validate: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
        requestId: req.requestId ?? 'unknown',
      },
    });
  },
});

/**
 * General API rate limiter.
 * Authenticated users: 100 requests per minute (keyed by user ID).
 * Anonymous users: 30 requests per minute (keyed by IP).
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: (req: Request) => (req.user ? 100 : 30),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    req.user ? `user:${req.user.userId}` : (req.ip ?? 'unknown'),
  skip: () => isTest,
  validate: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
        requestId: req.requestId ?? 'unknown',
      },
    });
  },
});
