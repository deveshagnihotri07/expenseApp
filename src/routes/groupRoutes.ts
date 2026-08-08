import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createGroup,
  createGroupValidation,
  getGroups,
  getGroupById,
  deleteGroup,
} from '../controllers/groupController';

const router = Router();

router.post('/', authenticate, createGroupValidation, createGroup);
router.get('/', authenticate, getGroups);
router.get('/:groupId', authenticate, getGroupById);
router.delete('/:groupId', authenticate, deleteGroup);

export default router;
