import { Router } from 'express';
import * as layoutController from '../controllers/layout.controller.js';

const router = Router();
router.get('/', layoutController.listLayouts);
router.get('/:id', layoutController.getLayout);
router.post('/', layoutController.createLayout);
router.put('/:id', layoutController.updateLayout);
router.patch('/:id', layoutController.updateLayoutMeta);
router.delete('/:id', layoutController.deleteLayout);
router.post('/:id/clone', layoutController.cloneLayout);

export default router;
