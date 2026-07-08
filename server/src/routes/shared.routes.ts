import { Router } from 'express';
import * as shareController from '../controllers/share.controller.js';

const router = Router();

// Public route - get shared layout by slug
router.get('/shared/:slug', shareController.getSharedLayout);

// Share management — no auth required
router.post('/layouts/:id/share', shareController.createShare);
router.get('/layouts/:id/shares', shareController.listSharesByLayout);
router.delete('/shared/:shareId', shareController.deleteShare);

export default router;
