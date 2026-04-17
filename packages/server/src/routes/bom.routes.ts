import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import * as bomController from '../controllers/bom.controller.js';

const router = Router();

// Optional auth - authenticated users get their userId linked
router.post('/submit', optionalAuth, bomController.submitBom);

// Auth required - prevents enumeration of other users' BOM data
router.get('/:id/download', requireAuth, bomController.downloadBom);

export default router;
