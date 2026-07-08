import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/bomGeneration.controller.js';
import { sendToThemisHandler } from '../controllers/themis.controller.js';

const router = Router();

router.post('/generate/:layoutId', requireAuth, ctrl.generateHandler);
router.get('/generation/:layoutId', requireAuth, ctrl.getGenerationHandler);
router.get('/generation/:layoutId/files/:filename', requireAuth, ctrl.serveFileHandler);
router.post('/send-to-themis/:layoutId', requireAuth, sendToThemisHandler);

export default router;
