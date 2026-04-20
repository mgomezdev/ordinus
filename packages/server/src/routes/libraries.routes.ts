import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import * as controller from '../controllers/library.controller.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// GET /libraries - List all libraries
router.get('/', controller.listLibraries);

// GET /libraries/:id - Get single library
router.get('/:id', controller.getLibrary);

// GET /libraries/:libraryId/items - List items in a library
router.get('/:libraryId/items', controller.listLibraryItems);

// GET /libraries/:libraryId/items/:itemId - Get single item
router.get('/:libraryId/items/:itemId', controller.getLibraryItem);

// Admin CRUD routes
// POST /libraries - Create library
router.post('/', requireAuth, requireAdmin, controller.createLibrary);

// PATCH /libraries/:id - Update library
router.patch('/:id', requireAuth, requireAdmin, controller.updateLibrary);

// DELETE /libraries/:id - Soft-delete library
router.delete('/:id', requireAuth, requireAdmin, controller.deleteLibrary);

// POST /libraries/:libraryId/items - Create item
router.post('/:libraryId/items', requireAuth, requireAdmin, controller.createItem);

// PATCH /libraries/:libraryId/items/:itemId - Update item
router.patch('/:libraryId/items/:itemId', requireAuth, requireAdmin, controller.updateItem);

// DELETE /libraries/:libraryId/items/:itemId - Soft-delete item
router.delete('/:libraryId/items/:itemId', requireAuth, requireAdmin, controller.deleteItem);

// POST /libraries/:libraryId/items/:itemId/image - Upload item image
router.post(
  '/:libraryId/items/:itemId/image',
  requireAuth,
  requireAdmin,
  upload.single('image'),
  controller.uploadItemImage,
);

export default router;
