import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { GuestAccess } from '../services/guestPreview.service.js';
import { guestImagePath } from '../services/guestPreview.service.js';
import { guestModels, guestModelPath } from '../services/guestModels.service.js';
import { authorizeLive, enterLive, liveCommand, liveSnapshot } from '../services/live.service.js';
import type { LiveActor } from '../services/live.service.js';
import { layoutChanged, layoutWrite, watchLayout } from '../services/layoutWrites.js';
import { client } from '../db/connection.js';
import { readAdminCookie } from '../middleware/adminAuth.js';
import { parseIntParam } from '../utils/params.js';

const writeLimit = rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false });
function guestToken(req: Request): string { return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('ordinus_guest='))?.slice('ordinus_guest='.length) ?? ''; }
function stream(layoutId: number, actor: LiveActor, expiresAt: number, res: Response): Promise<void> {
  return (async () => {
    const authorization = await authorizeLive(layoutId, actor);
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); res.flushHeaders();
    let ended = false;
    const send = (event: string) => { if (!ended) res.write(`event: ${event}\ndata: {}\n\n`); };
    const check = async () => {
      try { await authorizeLive(layoutId, actor); send('changed'); }
      catch { send('closed'); res.end(); }
    };
    const unwatch = watchLayout(layoutId, () => { void check(); });
    const leave = enterLive(layoutId, authorization.id, authorization.name, actor.role);
    const heartbeat = setInterval(() => { void check(); }, 15_000); heartbeat.unref();
    const expiry = Number.isFinite(expiresAt) ? setTimeout(() => { send('closed'); res.end(); }, Math.max(0, expiresAt - Date.now())) : null;
    expiry?.unref();
    res.on('close', () => { ended = true; clearInterval(heartbeat); if (expiry) clearTimeout(expiry); unwatch(); leave(); });
    // Closes the lookup/subscription race and provides an initial readiness event.
    await check(); send('ready');
  })();
}
export function guestLiveRouter(): Router {
  const router = Router({ mergeParams: true });
  const access = (res: Response) => res.locals.guest as GuestAccess;
  const actor = (req: Request): LiveActor => ({ role: 'guest', linkId: String(req.params.id), token: guestToken(req) });
  router.get('/snapshot', async (req, res, next) => {
    try { res.json(await liveSnapshot(access(res).layoutId, actor(req), access(res).linkId)); } catch (err) { next(err); }
  });
  router.post('/commands', writeLimit, async (req, res, next) => {
    try { res.json(await liveCommand(access(res).layoutId, actor(req), req.body)); } catch (err) { next(err); }
  });
  router.get('/events', async (req, res, next) => {
    try { await stream(access(res).layoutId, actor(req), access(res).expiresAt, res); } catch (err) { if (res.headersSent) res.end(); else next(err); }
  });
  return router;
}
export function ownerLiveRouter(): Router {
  const router = Router({ mergeParams: true });
  const id = (req: Request) => parseIntParam(req, 'layoutId', 'layout ID');
  const actor = (req: Request): LiveActor => ({ role: 'owner', token: readAdminCookie(req) });
  const access = (req: Request): GuestAccess => ({ layoutId: id(req), linkId: `owner-${id(req)}`, expiresAt: Infinity });
  router.get('/snapshot', async (req, res, next) => {
    try {
      const snapshot = await liveSnapshot(id(req), actor(req), access(req).linkId);
      const base = `/api/v1/layouts/${id(req)}/live`;
      snapshot.layout.referenceImages = snapshot.layout.referenceImages.map(image => ({ ...image, url: `${base}/assets/${image.id}` }));
      res.json(snapshot);
    } catch (err) { next(err); }
  });
  router.post('/commands', writeLimit, async (req, res, next) => {
    try { res.json(await liveCommand(id(req), actor(req), req.body)); } catch (err) { next(err); }
  });
  router.get('/events', async (req, res, next) => {
    try { await stream(id(req), actor(req), Infinity, res); } catch (err) { if (res.headersSent) res.end(); else next(err); }
  });
  router.delete('/access', async (req, res, next) => {
    try {
      await layoutWrite(async () => {
        await client.execute({ sql: 'UPDATE guest_links SET revoked_at=COALESCE(revoked_at, ?) WHERE layout_id=? AND allow_edit=1', args: [Date.now(), id(req)] });
        layoutChanged(id(req));
      });
      res.sendStatus(204);
    } catch (err) { next(err); }
  });
  router.get('/models', async (req, res, next) => {
    try {
      const base = `/api/v1/layouts/${id(req)}/live`;
      res.json({ bins: (await guestModels(access(req))).map(model => ({ ...model, topUrl: model.topUrl ? `${base}/bins/${model.id}/top` : null, perspectiveUrl: model.perspectiveUrl ? `${base}/bins/${model.id}/perspective` : null })) });
    } catch (err) { next(err); }
  });
  router.get('/assets/:placementId', async (req, res, next) => {
    try { res.sendFile(await guestImagePath(access(req), parseIntParam(req, 'placementId', 'image ID')), { cacheControl: false }); } catch (err) { next(err); }
  });
  router.get('/bins/:binId/:view', async (req, res, next) => {
    try {
      const view = String(req.params.view);
      if (view !== 'top' && view !== 'perspective') throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Invalid bin view');
      res.sendFile(await guestModelPath(access(req), parseIntParam(req, 'binId', 'bin ID'), view), { cacheControl: false });
    } catch (err) { next(err); }
  });
  return router;
}
