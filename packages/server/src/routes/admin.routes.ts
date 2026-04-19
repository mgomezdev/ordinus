import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import * as layoutController from '../controllers/layout.controller.js';

const router = Router();

// All admin routes require auth + admin role
router.get('/admin/layouts/count', requireAuth, requireAdmin, layoutController.getSubmittedCount);
router.patch('/admin/layouts/:id/deliver', requireAuth, requireAdmin, layoutController.deliverLayout);
router.get('/admin/users', requireAuth, requireAdmin, layoutController.getAdminUsers);
router.get('/admin/layouts', requireAuth, requireAdmin, layoutController.listAdminUserLayouts);

export default router;
