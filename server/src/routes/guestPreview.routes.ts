import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { secureCookie } from '../middleware/adminAuth.js';
import { parseIntParam } from '../utils/params.js';
import * as guest from '../services/guestPreview.service.js';
import { guestModels, guestModelPath } from '../services/guestModels.service.js';
import { guestLiveRouter } from './live.routes.js';

const router = Router();
const joinLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false });
const joinSchema = z.object({ secret: z.string().min(1).max(100), displayName: z.string().trim().min(1).max(60).optional() }).strict();
const cookieOptions = (id: string) => ({ httpOnly: true, secure: secureCookie, sameSite: 'strict' as const, path: `/api/v1/guest/${id}` });
function cookie(req: Request): string {
  return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${guest.GUEST_COOKIE}=`))?.slice(guest.GUEST_COOKIE.length + 1) ?? '';
}
function id(req: Request): string {
  const value = String(req.params.id);
  if (!/^[a-f0-9]{24}$/.test(value)) throw new guest.GuestAccessClosed();
  return value;
}
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
router.post('/:id/join', joinLimit, async (req, res, next) => {
  try {
    const linkId = id(req);
    const parsed = joinSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid preview invitation');
    const session = await guest.joinGuestLink(linkId, parsed.data.secret, parsed.data.displayName);
    res.cookie(guest.GUEST_COOKIE, session.token, { ...cookieOptions(linkId), maxAge: Math.max(0, session.expiresAt - Date.now()) });
    res.sendStatus(204);
  } catch (err) { next(err); }
});
router.use('/:id', async (req, res, next) => {
  try { res.locals.guest = await guest.guestAccess(id(req), cookie(req)); next(); }
  catch (err) { next(err); }
});
router.get('/:id/status', (_req, res) => { res.json({ active: true }); });
router.use('/:id/live', guestLiveRouter());
router.get('/:id/models', async (_req, res, next) => {
  try { res.json({ bins: await guestModels(res.locals.guest as guest.GuestAccess) }); }
  catch (err) { next(err); }
});
router.get('/:id/bins/:binId/:view', async (req, res, next) => {
  try {
    const view = String(req.params.view);
    if (view !== 'top' && view !== 'perspective') throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid bin view');
    const file = await guestModelPath(res.locals.guest as guest.GuestAccess, parseIntParam(req, 'binId', 'bin ID'), view);
    res.sendFile(file, { cacheControl: false }, err => {
      if (err && !res.headersSent) next(new AppError(ErrorCodes.NOT_FOUND, 'Bin preview is unavailable'));
    });
  } catch (err) { next(err); }
});
router.get('/:id/view', async (_req, res, next) => {
  try {
    const access = res.locals.guest as guest.GuestAccess;
    res.json({ layout: await guest.getGuestPreview(access), expiresAt: new Date(access.expiresAt).toISOString(), collaboration: access.allowEdit ?? false });
  } catch (err) { next(err); }
});
router.get('/:id/assets/:placementId', async (req, res, next) => {
  try {
    const file = await guest.guestImagePath(res.locals.guest as guest.GuestAccess, parseIntParam(req, 'placementId', 'image ID'));
    res.sendFile(file, { cacheControl: false }, err => {
      if (err && !res.headersSent) next(new AppError(ErrorCodes.NOT_FOUND, 'Image not found'));
    });
  } catch (err) { next(err); }
});
router.post('/:id/leave', async (req, res, next) => {
  try { await guest.leaveGuestLink(id(req), cookie(req)); res.clearCookie(guest.GUEST_COOKIE, cookieOptions(id(req))); res.sendStatus(204); }
  catch (err) { next(err); }
});
router.use((_req, res) => { res.sendStatus(405); });
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof guest.GuestAccessClosed) {
    res.status(410).json({ error: { code: 'GUEST_ACCESS_CLOSED', message: 'This preview link is closed or has expired. Ask your organizer for a new link.' } });
  } else next(err);
});
export default router;
