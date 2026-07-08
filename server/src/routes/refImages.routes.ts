import { Router } from 'express';
import multer from 'multer';
import * as refImageController from '../controllers/refImage.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.get('/', refImageController.listRefImages);
router.post('/', upload.single('image'), refImageController.uploadRefImage);
router.patch('/:id', refImageController.renameRefImage);
router.delete('/:id', refImageController.deleteRefImage);

export default router;
