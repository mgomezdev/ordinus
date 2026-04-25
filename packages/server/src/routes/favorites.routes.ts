import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as favoritesController from '../controllers/favorites.controller.js';

const router = Router();

router.use(requireAuth);

router.get('/', favoritesController.listFavorites);
router.post('/', favoritesController.createFavorite);
router.delete('/:id', favoritesController.deleteFavorite);
router.patch('/:id/name', favoritesController.renameFavorite);

export default router;
