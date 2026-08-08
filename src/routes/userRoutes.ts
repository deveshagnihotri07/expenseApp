import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getUserProfile,
  updateUserProfile,
  getAllUsers,
} from '../controllers/userController';

const router = Router();

router.get('/profile', authenticate, getUserProfile);
router.put('/profile', authenticate, updateUserProfile);
router.get('/users', authenticate, getAllUsers);

export default router;
