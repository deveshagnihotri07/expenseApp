import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createExpense,
  getExpenses,
  getExpenseById,
  updateExpense,
  settleExpense,
  deleteExpense,
} from '../controllers/expenseController';

const router = Router();

router.post('/', authenticate, createExpense);
router.get('/', authenticate, getExpenses);
router.get('/:expenseId', authenticate, getExpenseById);
router.put('/:expenseId', authenticate, updateExpense);
router.post('/:expenseId/settle', authenticate, settleExpense);
router.delete('/:expenseId', authenticate, deleteExpense);

export default router;
