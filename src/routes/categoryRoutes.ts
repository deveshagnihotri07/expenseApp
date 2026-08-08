import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController';

const router = Router();

router.get('/', authenticate, getCategories);
router.post('/', authenticate, createCategory);
router.put('/:categoryId', authenticate, updateCategory);
router.delete('/:categoryId', authenticate, deleteCategory);

export default router;
