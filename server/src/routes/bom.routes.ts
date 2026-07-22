import { Router } from 'express';
import * as ctrl from '../controllers/bomGeneration.controller.js';
import { sendToThemisHandler } from '../controllers/themis.controller.js';

const router = Router();

router.post('/generate/:layoutId', ctrl.generateHandler);
router.get('/generation/:layoutId', ctrl.getGenerationHandler);
router.get('/generation/:layoutId/files/:filename', ctrl.serveFileHandler);
router.post('/send-to-themis/:layoutId', sendToThemisHandler);

export default router;
