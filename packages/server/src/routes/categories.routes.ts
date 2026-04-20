import { Router } from 'express';
import * as controller from '../controllers/library.controller.js';

const router = Router();

// GET /categories - List all categories
router.get('/', controller.listCategories);

export default router;
