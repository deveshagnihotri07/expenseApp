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
       ORDER BY e.created_at DESC`,
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
