import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import * as ctrl from '../controllers/userStls.controller.js';

// Ensure upload directory exists
fs.mkdirSync(config.USER_STL_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.USER_STL_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `tmp-${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.stl' || ext === '.3mf') {
      cb(null, true);
    } else {
      cb(new Error('Only .stl and .3mf files are allowed'));
    }
  },
});

const router = Router();

router.post('/', requireAuth, upload.single('file'), ctrl.uploadHandler);
router.get('/', requireAuth, ctrl.listHandler);
router.get('/:id', requireAuth, ctrl.getOneHandler);
router.put('/:id', requireAuth, ctrl.updateMetaHandler);
router.delete('/:id', requireAuth, ctrl.deleteHandler);
router.put('/:id/file', requireAuth, upload.single('file'), ctrl.replaceFileHandler);
router.post('/:id/reprocess', requireAuth, ctrl.reprocessHandler);
router.get('/:id/file', requireAuth, ctrl.downloadFileHandler);
router.get('/:id/images/:filename', requireAuth, ctrl.serveImageHandler);

export default router;
