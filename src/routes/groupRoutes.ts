import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createGroup,
  createGroupValidation,
  getGroups,
  getGroupById,
  deleteGroup,
  getGroupBalances,
  getGroupSettlements,
  settleGroupMember,
} from '../controllers/groupController';

const router = Router();

router.post('/', authenticate, createGroupValidation, createGroup);
router.get('/', authenticate, getGroups);
router.get('/:groupId/balances', authenticate, getGroupBalances);
router.get('/:groupId/settlements', authenticate, getGroupSettlements);
router.post('/:groupId/settle', authenticate, settleGroupMember);
router.get('/:groupId', authenticate, getGroupById);
router.delete('/:groupId', authenticate, deleteGroup);

export default router;
