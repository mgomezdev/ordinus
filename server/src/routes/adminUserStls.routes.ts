import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { listAllHandler, promoteHandler } from '../controllers/adminUserStls.controller.js';

const router = Router();
router.get('/admin/user-stls', requireAuth, requireAdmin, listAllHandler);
router.post('/admin/user-stls/:id/promote', requireAuth, requireAdmin, promoteHandler);
export default router;
