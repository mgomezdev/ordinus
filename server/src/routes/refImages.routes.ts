import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import * as refImageController from '../controllers/refImage.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// All routes require authentication
router.use(requireAuth);

router.get('/', refImageController.listRefImages);
router.post('/', upload.single('image'), refImageController.uploadRefImage);
router.post('/global', requireAdmin, upload.single('image'), refImageController.uploadGlobalRefImage);
router.patch('/:id', refImageController.renameRefImage);
router.delete('/:id', refImageController.deleteRefImage);

export default router;
