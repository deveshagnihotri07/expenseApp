import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query, getClient } from '../config/database';

interface SplitInput {
  userId: string;
  amount?: number;
  percentage?: number;
}

const getGroupMemberIds = async (groupId: string): Promise<Set<string>> => {
  const result = await query(
    'SELECT user_id FROM group_members WHERE group_id = $1',
    [groupId]
  );
  return new Set(result.rows.map((r: any) => r.user_id));
};

export const createExpense = async (req: AuthRequest, res: Response) => {
  try {
    const {
      description,
      amount,
      currency = 'INR',
      categoryId,
      groupId,
      splits,
      splitMethod = 'equal',
      createdById,
      expenseDate,
    } = req.body;

    const userId = req.user!.id;
    const paidBy = createdById || userId;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    if (expenseDate && !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return res.status(400).json({ message: 'expenseDate must be in YYYY-MM-DD format' });
    }

    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ message: 'At least one split is required' });
    }

    if (splits.some((s: any) => !s.userId)) {
      return res.status(400).json({ message: 'Each split must include a valid user' });
    }

    if (splitMethod === 'percentage') {
      const totalPct = splits.reduce(
        (sum: number, s: any) => sum + (s.percentage || 0),
        0
      );
      if (Math.abs(totalPct - 100) > 0.5) {
        return res.status(400).json({ message: 'Percentages must add up to 100%' });
      }
    }

    if (groupId) {
      const memberIds = await getGroupMemberIds(groupId);
      if (!memberIds.has(userId)) {
        return res.status(403).json({ message: 'You are not a member of this group' });
      }
      if (!memberIds.has(paidBy)) {
        return res.status(400).json({ message: 'Payer must be a member of the group' });
      }
      if (splits.some((s: any) => !memberIds.has(s.userId))) {
        return res.status(400).json({ message: 'All split participants must be group members' });
      }
    } else if (paidBy !== userId) {
      return res.status(400).json({ message: 'Personal expenses must be paid by you' });
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');

      let splitRecords: { userId: string; amount: number }[] = [];

      if (splitMethod === 'equal') {
        const perPerson = amount / splits.length;
        splitRecords = splits.map((s: SplitInput) => ({
          userId: s.userId,
          amount: parseFloat(perPerson.toFixed(2)),
        }));
      } else if (splitMethod === 'percentage') {
        splitRecords = splits.map((s: SplitInput) => ({
          userId: s.userId,
          amount: parseFloat(((s.percentage! / 100) * amount).toFixed(2)),
        }));
      } else if (splitMethod === 'exact') {
        splitRecords = splits.map((s: SplitInput) => ({
          userId: s.userId,
          amount: parseFloat(s.amount!.toFixed(2)),
        }));
      } else {
        const totalShares = splits.reduce(
          (sum: number, s: any) => sum + s.share,
          0
        );
        splitRecords = splits.map((s: any) => ({
          userId: s.userId,
          amount: parseFloat(((s.share / totalShares) * amount).toFixed(2)),
        }));
      }

      const expenseResult = await client.query(
        `INSERT INTO expenses (description, amount, currency, category_id, group_id, created_by, expense_date, is_personal)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, CURRENT_DATE), $8) RETURNING *`,
        [
          description || null,
          amount,
          currency,
          categoryId || null,
          groupId || null,
          paidBy,
          expenseDate || null,
          !groupId,
        ]
      );

      const expense = expenseResult.rows[0];

      for (const split of splitRecords) {
        await client.query(
          `INSERT INTO expense_splits (expense_id, user_id, amount, share_type)
           VALUES ($1, $2, $3, $4)`,
          [expense.id, split.userId, split.amount, splitMethod]
        );
      }

      await client.query('COMMIT');
      client.release();

      res.status(201).json({
        id: expense.id,
        description: expense.description,
        amount: parseFloat(expense.amount),
        currency: expense.currency,
        categoryId: expense.category_id,
        groupId: expense.group_id,
        createdBy: expense.created_by,
        expenseDate: expense.expense_date,
        isPersonal: expense.is_personal,
        createdAt: expense.created_at,
      });
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // connection may already be broken
      }
      client.release();
      throw error;
    }
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { expenseId } = req.params;
    const userId = req.user!.id;

    const {
      description,
      amount,
      currency = 'INR',
      categoryId,
      groupId,
      splits,
      splitMethod = 'equal',
      createdById,
      expenseDate,
    } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid amount is required' });
    }

    if (expenseDate && !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
      return res.status(400).json({ message: 'expenseDate must be in YYYY-MM-DD format' });
    }

    if (!splits || !Array.isArray(splits) || splits.length === 0) {
      return res.status(400).json({ message: 'At least one split is required' });
    }

    if (splits.some((s: any) => !s.userId)) {
      return res.status(400).json({ message: 'Each split must include a valid user' });
    }

    if (splitMethod === 'percentage') {
      const totalPct = splits.reduce(
        (sum: number, s: any) => sum + (s.percentage || 0),
        0
      );
      if (Math.abs(totalPct - 100) > 0.5) {
        return res.status(400).json({ message: 'Percentages must add up to 100%' });
      }
    }

    const existing = await query(
      'SELECT id, created_by, group_id FROM expenses WHERE id = $1',
      [expenseId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const isGroupExpense = !!existing.rows[0].group_id;
    if (isGroupExpense) {
      const memberIds = await getGroupMemberIds(existing.rows[0].group_id);
      if (!memberIds.has(userId)) {
        return res.status(403).json({ message: 'Not authorized to edit this expense' });
      }
    } else if (existing.rows[0].created_by !== userId) {
      return res.status(403).json({ message: 'Not authorized to edit this expense' });
    }

    const paidBy = createdById || existing.rows[0].created_by;

    if (groupId) {
      const memberIds = await getGroupMemberIds(groupId);
      if (!memberIds.has(userId)) {
        return res.status(403).json({ message: 'You are not a member of this group' });
      }
      if (!memberIds.has(paidBy)) {
        return res.status(400).json({ message: 'Payer must be a member of the group' });
      }
      if (splits.some((s: any) => !memberIds.has(s.userId))) {
        return res.status(400).json({ message: 'All split participants must be group members' });
      }
    } else if (paidBy !== userId) {
      return res.status(400).json({ message: 'Personal expenses must be paid by you' });
    }

    let splitRecords: { userId: string; amount: number }[] = [];

    if (splitMethod === 'equal') {
      const perPerson = amount / splits.length;
      splitRecords = splits.map((s: SplitInput) => ({
        userId: s.userId,
        amount: parseFloat(perPerson.toFixed(2)),
      }));
    } else if (splitMethod === 'percentage') {
      splitRecords = splits.map((s: SplitInput) => ({
        userId: s.userId,
        amount: parseFloat(((s.percentage! / 100) * amount).toFixed(2)),
      }));
    } else if (splitMethod === 'exact') {
      splitRecords = splits.map((s: SplitInput) => ({
        userId: s.userId,
        amount: parseFloat(s.amount!.toFixed(2)),
      }));
    } else {
      const totalShares = splits.reduce((sum: number, s: any) => sum + s.share, 0);
      splitRecords = splits.map((s: any) => ({
        userId: s.userId,
        amount: parseFloat(((s.share / totalShares) * amount).toFixed(2)),
      }));
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE expenses
         SET description = $1, amount = $2, currency = $3, category_id = $4,
             group_id = $5, is_personal = $6, created_by = $7,
             expense_date = COALESCE($8, expense_date), updated_at = NOW()
         WHERE id = $9`,
        [
          description || null,
          amount,
          currency,
          categoryId || null,
          groupId || null,
          !groupId,
          paidBy,
          expenseDate || null,
          expenseId,
        ]
      );

      await client.query('DELETE FROM expense_splits WHERE expense_id = $1', [
        expenseId,
      ]);

      for (const split of splitRecords) {
        await client.query(
          `INSERT INTO expense_splits (expense_id, user_id, amount, share_type)
           VALUES ($1, $2, $3, $4)`,
          [expenseId, split.userId, split.amount, splitMethod]
        );
      }

      await client.query('COMMIT');
      client.release();
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // connection may already be broken
      }
      client.release();
      throw error;
    }

    const result = await query(
      `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.id = $1`,
      [expenseId]
    );

    const expense = result.rows[0];

    res.json({
      id: expense.id,
      description: expense.description,
      amount: parseFloat(expense.amount),
      currency: expense.currency,
      categoryId: expense.category_id,
      groupId: expense.group_id,
      createdBy: expense.created_by,
      expenseDate: expense.expense_date,
      isPersonal: expense.is_personal,
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { groupId } = req.query;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit as string, 10) || 20)
    );
    const offset = (page - 1) * limit;

    let whereClause: string;
    const params: any[] = [];
    if (groupId) {
      whereClause = 'e.group_id = $1';
      params.push(groupId);
    } else {
      whereClause = 'e.created_by = $1 AND e.is_personal = true';
      params.push(userId);
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM expenses e WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const result = await query(
      `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE ${whereClause}
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const expenses = await Promise.all(
      result.rows.map(async (expense: any) => {
        const splitsResult = await query(
          `SELECT es.user_id, es.amount, es.share_type, es.is_settled,
                  u.name, u.email
           FROM expense_splits es
           JOIN users u ON es.user_id = u.id
           WHERE es.expense_id = $1`,
          [expense.id]
        );

        return {
          id: expense.id,
          description: expense.description,
          amount: parseFloat(expense.amount),
          currency: expense.currency,
          category: expense.category_name
            ? {
                id: expense.category_id,
                name: expense.category_name,
                icon: expense.category_icon,
                color: expense.category_color,
              }
            : null,
          groupId: expense.group_id,
          createdBy: expense.created_by,
          expenseDate: expense.expense_date,
          isSettled: expense.is_settled,
          createdAt: expense.created_at,
          updatedAt: expense.updated_at,
          splits: splitsResult.rows.map((s: any) => ({
            userId: s.user_id,
            userName: s.name,
            amount: parseFloat(s.amount),
            shareType: s.share_type,
            isSettled: s.is_settled,
          })),
        };
      })
    );

    res.json({
      expenses,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getExpenseById = async (req: AuthRequest, res: Response) => {
  try {
    const { expenseId } = req.params;

    const result = await query(
      `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.id = $1`,
      [expenseId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const expense = result.rows[0];

    const splitsResult = await query(
      `SELECT es.user_id, es.amount, es.share_type, es.is_settled,
              u.name, u.email
       FROM expense_splits es
       JOIN users u ON es.user_id = u.id
       WHERE es.expense_id = $1`,
      [expense.id]
    );

    res.json({
      id: expense.id,
      description: expense.description,
      amount: parseFloat(expense.amount),
      currency: expense.currency,
      category: expense.category_name
        ? {
            id: expense.category_id,
            name: expense.category_name,
            icon: expense.category_icon,
            color: expense.category_color,
          }
        : null,
      groupId: expense.group_id,
      createdBy: expense.created_by,
      expenseDate: expense.expense_date,
      isSettled: expense.is_settled,
      createdAt: expense.created_at,
      updatedAt: expense.updated_at,
      splits: splitsResult.rows.map((s: any) => ({
        userId: s.user_id,
        userName: s.name,
        amount: parseFloat(s.amount),
        shareType: s.share_type,
        isSettled: s.is_settled,
      })),
    });
  } catch (error) {
    console.error('Get expense by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const settleExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { expenseId } = req.params;
    const { fromUserId, amount } = req.body;

    await query(
      'UPDATE expense_splits SET is_settled = true WHERE expense_id = $1 AND user_id = $2',
      [expenseId, fromUserId]
    );

    const allSplits = await query(
      'SELECT id FROM expense_splits WHERE expense_id = $1',
      [expenseId]
    );

    let allSettled = true;
    for (const split of allSplits.rows) {
      const check = await query(
        'SELECT is_settled FROM expense_splits WHERE id = $1',
        [split.id]
      );
      if (!check.rows[0]?.is_settled) {
        allSettled = false;
        break;
      }
    }

    if (allSettled) {
      await query('UPDATE expenses SET is_settled = true WHERE id = $1', [
        expenseId,
      ]);
    }

    res.json({ message: 'Expense settled successfully' });
  } catch (error) {
    console.error('Settle expense error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { expenseId } = req.params;
    const userId = req.user!.id;

    const existing = await query(
      'SELECT id, created_by, group_id FROM expenses WHERE id = $1',
      [expenseId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Expense not found' });
    }

    const isGroupExpense = !!existing.rows[0].group_id;
    if (isGroupExpense) {
      const memberIds = await getGroupMemberIds(existing.rows[0].group_id);
      if (!memberIds.has(userId)) {
        return res
          .status(403)
          .json({ message: 'Not authorized to delete this expense' });
      }
    } else if (existing.rows[0].created_by !== userId) {
      return res
        .status(403)
        .json({ message: 'Not authorized to delete this expense' });
    }

    await query('DELETE FROM expenses WHERE id = $1', [expenseId]);

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
