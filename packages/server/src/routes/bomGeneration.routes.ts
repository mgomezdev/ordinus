import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import * as ctrl from '../controllers/bomGeneration.controller.js';

const router = Router();

router.post('/admin/bom/:submissionId/generate', requireAuth, requireAdmin, ctrl.generateHandler);
router.get('/admin/bom/:submissionId/generation', requireAuth, requireAdmin, ctrl.getGenerationHandler);
router.get('/admin/bom/:submissionId/files/:filename', requireAuth, requireAdmin, ctrl.serveFileHandler);

export default router;
