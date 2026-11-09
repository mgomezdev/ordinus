import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { authService, SESSION_LIFETIME } from '../services/auth.service.js';
import { ADMIN_COOKIE, secureCookie, readAdminCookie, requireAdmin } from '../middleware/adminAuth.js';

const router = Router();
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
const issueLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 3, keyGenerator: () => 'single-admin', standardHeaders: 'draft-8', legacyHeaders: false });
const verifyLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
const cookieOptions = { httpOnly: true, secure: secureCookie, sameSite: 'strict' as const, path: '/' };
const loginSchema = z.object({ username: z.string().max(100), password: z.string().min(1).max(256) });
const resetSchema = z.object({ requestId: z.string().min(1).max(100), code: z.string().min(1).max(100), password: z.string().min(12).max(256) });
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.get('/session', requireAdmin, (_req, res) => { res.json({ username: 'admin' }); });
router.post('/login', loginLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Enter a username and password');
    const token = await authService.login(parsed.data.username, parsed.data.password);
    const previous = readAdminCookie(req);
    if (previous) await authService.logout(previous);
    res.cookie(ADMIN_COOKIE, token, { ...cookieOptions, maxAge: SESSION_LIFETIME });
    res.json({ username: 'admin' });
  } catch (err) { next(err); }
});
router.post('/logout', requireAdmin, async (req, res, next) => {
  try {
    await authService.logout(readAdminCookie(req));
    res.clearCookie(ADMIN_COOKIE, cookieOptions);
    res.sendStatus(204);
  } catch (err) { next(err); }
});
router.post('/reset/request', issueLimit, async (_req, res, next) => {
  try {
    const { requestId } = await authService.issueReset();
    res.status(202).json({ requestId, message: 'If admin setup is complete, a reset code has been written to the server logs.' });
  } catch (err) { next(err); }
});
router.post('/reset/complete', verifyLimit, async (req, res, next) => {
  try {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Enter the reset code and a password of 12 to 256 characters');
    await authService.resetPassword(parsed.data.requestId, parsed.data.code, parsed.data.password);
    res.clearCookie(ADMIN_COOKIE, cookieOptions);
    res.sendStatus(204);
  } catch (err) { next(err); }
});
export default router;
