import { Router } from 'express';
import * as favoritesController from '../controllers/favorites.controller.js';

const router = Router();

router.get('/', favoritesController.listFavorites);
router.post('/', favoritesController.createFavorite);
router.delete('/:id', favoritesController.deleteFavorite);
router.patch('/:id/name', favoritesController.renameFavorite);

export default router;
