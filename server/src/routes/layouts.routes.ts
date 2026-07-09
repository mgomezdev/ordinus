import { Router } from 'express';
import multer from 'multer';
import * as layoutController from '../controllers/layout.controller.js';
import * as refImageController from '../controllers/referenceImage.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.get('/', layoutController.listLayouts);
router.get('/:id', layoutController.getLayout);
router.post('/', layoutController.createLayout);
router.put('/:id', layoutController.updateLayout);
router.patch('/:id', layoutController.updateLayoutMeta);
router.delete('/:id', layoutController.deleteLayout);
router.post('/:id/clone', layoutController.cloneLayout);

// Reference image endpoints
router.post('/:id/reference-images', upload.single('image'), refImageController.uploadReferenceImage);
router.delete('/:id/reference-images/:imgId', refImageController.deleteReferenceImage);

export default router;
