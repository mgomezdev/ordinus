import { Router } from 'express';
import multer from 'multer';
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

// Admin CRUD routes (no auth required — auth removed)
// POST /libraries - Create library
router.post('/', controller.createLibrary);

// PATCH /libraries/:id - Update library
router.patch('/:id', controller.updateLibrary);

// DELETE /libraries/:id - Soft-delete library
router.delete('/:id', controller.deleteLibrary);

// POST /libraries/:libraryId/items - Create item
router.post('/:libraryId/items', controller.createItem);

// PATCH /libraries/:libraryId/items/:itemId - Update item
router.patch('/:libraryId/items/:itemId', controller.updateItem);

// DELETE /libraries/:libraryId/items/:itemId - Soft-delete item
router.delete('/:libraryId/items/:itemId', controller.deleteItem);

// POST /libraries/:libraryId/items/:itemId/image - Upload item image
router.post(
  '/:libraryId/items/:itemId/image',
  upload.single('image'),
  controller.uploadItemImage,
);

export default router;
