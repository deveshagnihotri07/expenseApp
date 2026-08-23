import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { body, validationResult } from 'express-validator';

export const createGroupValidation = [
  body('name').trim().notEmpty().withMessage('Group name is required'),
  body('memberIds').isArray().withMessage('memberIds must be an array'),
];

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, memberIds } = req.body;
    const userId = req.user!.id;

    const result = await query(
      'INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name, description || null, userId]
    );

    const group = result.rows[0];

    const allMemberIds = [userId, ...new Set(memberIds)];
    for (const memberId of allMemberIds) {
      await query(
        'INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)',
        [group.id, memberId, memberId === userId ? 'admin' : 'member']
      );
    }

    res.status(201).json({
      id: group.id,
      name: group.name,
      description: group.description,
      createdBy: group.created_by,
      createdAt: group.created_at,
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getGroups = async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      `SELECT DISTINCT g.* FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.user!.id]
    );

    const groupsWithMembers = await Promise.all(
      result.rows.map(async (group: any) => {
        const membersResult = await query(
          `SELECT u.id, u.name, u.email, u.avatar_url, gm.role
           FROM group_members gm
           JOIN users u ON gm.user_id = u.id
           WHERE gm.group_id = $1`,
          [group.id]
        );
        return {
          id: group.id,
          name: group.name,
          description: group.description,
          createdBy: group.created_by,
          createdAt: group.created_at,
          members: membersResult.rows.map((m: any) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            avatarUrl: m.avatar_url,
            role: m.role,
          })),
        };
      })
    );

    res.json(groupsWithMembers);
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getGroupById = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const groupCheck = await query(
      'SELECT g.* FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE g.id = $1 AND gm.user_id = $2',
      [groupId, req.user!.id]
    );

    if (groupCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Group not found or not a member' });
    }

    const group = groupCheck.rows[0];

    const membersResult = await query(
      `SELECT u.id, u.name, u.email, u.avatar_url, gm.role
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`,
      [group.id]
    );

    const expensesResult = await query(
      `SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.group_id = $1
       ORDER BY e.expense_date DESC, e.created_at DESC`,
      [group.id]
    );

    const expensesWithSplits = await Promise.all(
      expensesResult.rows.map(async (expense: any) => {
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
          createdBy: expense.created_by,
          createdAt: expense.created_at,
          expenseDate: expense.expense_date,
          isSettled: expense.is_settled,
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
      id: group.id,
      name: group.name,
      description: group.description,
      createdBy: group.created_by,
      createdAt: group.created_at,
      members: membersResult.rows.map((m: any) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatar_url,
        role: m.role,
      })),
      expenses: expensesWithSplits,
    });
  } catch (error) {
    console.error('Get group by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const addGroupMember = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;
    const requesterId = req.user!.id;

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const memberCheck = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, requesterId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Group not found or not a member' });
    }

    const userCheck = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existsCheck = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    if (existsCheck.rows.length > 0) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    await query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [groupId, userId]
    );

    const newMember = await query(
      `SELECT u.id, u.name, u.email
       FROM users u WHERE u.id = $1`,
      [userId]
    );

    res.status(201).json({
      id: newMember.rows[0].id,
      name: newMember.rows[0].name,
      email: newMember.rows[0].email,
      role: 'member',
    });
  } catch (error) {
    console.error('Add group member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;

    const result = await query(
      'DELETE FROM groups WHERE id = $1 AND created_by = $2 RETURNING id',
      [groupId, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Group not found or not authorized' });
    }

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const formatMoney = (val: number) =>
  parseFloat(parseFloat(val.toString()).toFixed(2));

export const getGroupBalances = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    const memberCheck = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Group not found or not a member' });
    }

    const membersResult = await query(
      `SELECT gm.user_id, u.name, u.email
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`,
      [groupId]
    );

    const splitsResult = await query(
      `SELECT e.id, e.created_by, es.user_id as split_user_id, es.amount as split_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = $1 AND es.is_settled = false`,
      [groupId]
    );

    const byExpense: Record<
      string,
      { createdBy: string; splits: { userId: string; amount: number }[] }
    > = {};
    for (const row of splitsResult.rows) {
      if (!byExpense[row.id]) {
        byExpense[row.id] = { createdBy: row.created_by, splits: [] };
      }
      byExpense[row.id].splits.push({
        userId: row.split_user_id,
        amount: parseFloat(row.split_amount),
      });
    }

    const balanceMap: Record<string, number> = {};
    for (const exp of Object.values(byExpense)) {
      if (exp.createdBy === userId) {
        for (const s of exp.splits) {
          if (s.userId !== userId) {
            balanceMap[s.userId] = (balanceMap[s.userId] || 0) + s.amount;
          }
        }
      } else {
        const mySplit = exp.splits.find((s) => s.userId === userId);
        if (mySplit) {
          balanceMap[exp.createdBy] =
            (balanceMap[exp.createdBy] || 0) - mySplit.amount;
        }
      }
    }

    const settleResult = await query(
      `SELECT from_user_id, to_user_id, amount
       FROM settlements
       WHERE group_id = $1 AND (from_user_id = $2 OR to_user_id = $2)`,
      [groupId, userId]
    );
    for (const row of settleResult.rows) {
      const amt = parseFloat(row.amount);
      const other = row.from_user_id === userId ? row.to_user_id : row.from_user_id;
      if (row.from_user_id === userId) {
        balanceMap[other] = (balanceMap[other] || 0) + amt;
      } else {
        balanceMap[other] = (balanceMap[other] || 0) - amt;
      }
    }

    res.json(
      membersResult.rows
        .filter((m: any) => m.user_id !== userId)
        .map((m: any) => ({
          userId: m.user_id,
          name: m.name,
          email: m.email,
          balance: formatMoney(balanceMap[m.user_id] || 0),
        }))
    );
  } catch (error) {
    console.error('Get group balances error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getGroupSettlements = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const userId = req.user!.id;

    const memberCheck = await query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Group not found or not a member' });
    }

    const result = await query(
      `SELECT s.id, s.from_user_id, fu.name as from_name,
              s.to_user_id, tu.name as to_name,
              s.amount, TO_CHAR(s.settled_date, 'YYYY-MM-DD') as settled_date,
              s.payment_method
       FROM settlements s
       JOIN users fu ON s.from_user_id = fu.id
       JOIN users tu ON s.to_user_id = tu.id
       WHERE s.group_id = $1
       ORDER BY s.settled_date DESC, s.created_at DESC`,
      [groupId]
    );

    res.json(
      result.rows.map((r: any) => ({
        id: r.id,
        fromUserId: r.from_user_id,
        fromName: r.from_name,
        toUserId: r.to_user_id,
        toName: r.to_name,
        amount: formatMoney(r.amount),
        date: r.settled_date,
        paymentMethod: r.payment_method,
      }))
    );
  } catch (error) {
    console.error('Get group settlements error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const settleGroupMember = async (req: AuthRequest, res: Response) => {
  try {
    const { groupId } = req.params;
    const { memberId, amount, date, paymentMethod } = req.body;
    const userId = req.user!.id;

    if (!memberId || memberId === userId) {
      return res.status(400).json({ message: 'Invalid memberId' });
    }

    const settleAmount = Number(amount);
    if (!settleAmount || isNaN(settleAmount) || settleAmount <= 0) {
      return res
        .status(400)
        .json({ message: 'Amount must be a positive number' });
    }

    const memberCheck = await query(
      'SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2::uuid[])',
      [groupId, [userId, memberId]]
    );
    const memberSet = new Set(memberCheck.rows.map((r: any) => r.user_id));
    if (!memberSet.has(userId) || !memberSet.has(memberId)) {
      return res.status(400).json({ message: 'Both users must be group members' });
    }

    const splitsResult = await query(
      `SELECT e.created_by, es.user_id as split_user_id, es.amount as split_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = $1 AND es.is_settled = false`,
      [groupId]
    );

    let balance = 0;
    for (const row of splitsResult.rows) {
      const splitAmount = parseFloat(row.split_amount);
      if (row.created_by === userId && row.split_user_id === memberId) {
        balance += splitAmount;
      } else if (row.created_by === memberId && row.split_user_id === userId) {
        balance -= splitAmount;
      }
    }

    const settleHistory = await query(
      `SELECT from_user_id, to_user_id, amount
       FROM settlements
       WHERE group_id = $1
         AND ((from_user_id = $2 AND to_user_id = $3)
              OR (from_user_id = $3 AND to_user_id = $2))`,
      [groupId, userId, memberId]
    );
    for (const row of settleHistory.rows) {
      const amt = parseFloat(row.amount);
      if (row.from_user_id === userId) {
        balance += amt;
      } else {
        balance -= amt;
      }
    }

    const outstanding = Math.abs(balance);
    if (outstanding < 0.005) {
      return res.status(200).json({ message: 'Nothing to settle', amount: 0 });
    }

    if (settleAmount > outstanding + 0.005) {
      return res.status(400).json({
        message: `Amount cannot exceed outstanding balance of ${formatMoney(outstanding)}`,
      });
    }

    const debtor = balance > 0 ? memberId : userId;
    const creditor = balance > 0 ? userId : memberId;
    const settlementDate = date || new Date().toISOString().slice(0, 10);
    const method = paymentMethod || 'Other';

    await query(
      `INSERT INTO settlements (from_user_id, to_user_id, amount, group_id, settled_date, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [debtor, creditor, formatMoney(settleAmount), groupId, settlementDate, method]
    );

    const remaining = outstanding - settleAmount;

    res.json({
      message: 'Settled successfully',
      amount: formatMoney(settleAmount),
      memberId,
      remainingBalance: formatMoney(Math.max(0, remaining)),
      date: settlementDate,
      paymentMethod: method,
    });
  } catch (error) {
    console.error('Settle group member error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
