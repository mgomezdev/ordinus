import { Router } from 'express';
import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { parseIntParam } from '../utils/params.js';
import { createGuestLink, listGuestLinks, revokeGuestLink } from '../services/guestPreview.service.js';

const router = Router({ mergeParams: true });
const createSchema = z.object({ expiresInHours: z.union([z.literal(1), z.literal(24), z.literal(168)]).default(24), allowEdit: z.boolean().default(false), libraryId: z.string().regex(/^[a-z0-9_-]+$/).max(100).optional() }).strict();
router.get('/', async (req, res, next) => {
  try { res.json({ data: await listGuestLinks(parseIntParam(req, 'layoutId', 'layout ID')) }); }
  catch (err) { next(err); }
});
router.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Choose an expiry of 1 hour, 24 hours, or 7 days');
    res.status(201).json(await createGuestLink(parseIntParam(req, 'layoutId', 'layout ID'), parsed.data.expiresInHours, parsed.data));
  } catch (err) { next(err); }
});
router.delete('/:id', async (req, res, next) => {
  try { await revokeGuestLink(parseIntParam(req, 'layoutId', 'layout ID'), String(req.params.id)); res.sendStatus(204); }
  catch (err) { next(err); }
});
export default router;
