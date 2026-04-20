import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as shareController from '../controllers/share.controller.js';

const router = Router();

// Public route - get shared layout by slug
router.get('/shared/:slug', shareController.getSharedLayout);

// Authenticated routes - share management
router.post('/layouts/:id/share', requireAuth, shareController.createShare);
router.get('/layouts/:id/shares', requireAuth, shareController.listSharesByLayout);
router.delete('/shared/:shareId', requireAuth, shareController.deleteShare);

export default router;
