import { Router } from 'express';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import * as bomController from '../controllers/bom.controller.js';
import * as ctrl from '../controllers/bomGeneration.controller.js';

const router = Router();

// Optional auth - authenticated users get their userId linked
router.post('/submit', optionalAuth, bomController.submitBom);

// Auth required - prevents enumeration of other users' BOM data
router.get('/:id/download', requireAuth, bomController.downloadBom);

// BOM generation routes (user-accessible, ownership verified in controller)
router.post('/generate/:layoutId', requireAuth, ctrl.generateHandler);
router.get('/generation/:layoutId', requireAuth, ctrl.getGenerationHandler);
router.get('/generation/:layoutId/files/:filename', requireAuth, ctrl.serveFileHandler);

export default router;
