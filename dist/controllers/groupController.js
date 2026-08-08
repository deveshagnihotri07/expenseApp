"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGroup = exports.getGroupById = exports.getGroups = exports.createGroup = exports.createGroupValidation = void 0;
const database_1 = require("../config/database");
const express_validator_1 = require("express-validator");
exports.createGroupValidation = [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Group name is required'),
    (0, express_validator_1.body)('memberIds').isArray().withMessage('memberIds must be an array'),
];
const createGroup = async (req, res) => {
    try {
        const errors = (0, express_validator_1.validationResult)(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const { name, description, memberIds } = req.body;
        const userId = req.user.id;
        const result = await (0, database_1.query)('INSERT INTO groups (name, description, created_by) VALUES ($1, $2, $3) RETURNING *', [name, description || null, userId]);
        const group = result.rows[0];
        const allMemberIds = [userId, ...new Set(memberIds)];
        for (const memberId of allMemberIds) {
            await (0, database_1.query)('INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)', [group.id, memberId, memberId === userId ? 'admin' : 'member']);
        }
        res.status(201).json({
            id: group.id,
            name: group.name,
            description: group.description,
            createdBy: group.created_by,
            createdAt: group.created_at,
        });
    }
    catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.createGroup = createGroup;
const getGroups = async (req, res) => {
    try {
        const result = await (0, database_1.query)(`SELECT DISTINCT g.* FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`, [req.user.id]);
        const groupsWithMembers = await Promise.all(result.rows.map(async (group) => {
            const membersResult = await (0, database_1.query)(`SELECT u.id, u.name, u.email, u.avatar_url, gm.role
           FROM group_members gm
           JOIN users u ON gm.user_id = u.id
           WHERE gm.group_id = $1`, [group.id]);
            return {
                id: group.id,
                name: group.name,
                description: group.description,
                createdBy: group.created_by,
                createdAt: group.created_at,
                members: membersResult.rows.map((m) => ({
                    id: m.id,
                    name: m.name,
                    email: m.email,
                    avatarUrl: m.avatar_url,
                    role: m.role,
                })),
            };
        }));
        res.json(groupsWithMembers);
    }
    catch (error) {
        console.error('Get groups error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getGroups = getGroups;
const getGroupById = async (req, res) => {
    try {
        const { groupId } = req.params;
        const groupCheck = await (0, database_1.query)('SELECT g.* FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE g.id = $1 AND gm.user_id = $2', [groupId, req.user.id]);
        if (groupCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found or not a member' });
        }
        const group = groupCheck.rows[0];
        const membersResult = await (0, database_1.query)(`SELECT u.id, u.name, u.email, u.avatar_url, gm.role
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`, [group.id]);
        const expensesResult = await (0, database_1.query)(`SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.group_id = $1
       ORDER BY e.created_at DESC`, [group.id]);
        const expensesWithSplits = await Promise.all(expensesResult.rows.map(async (expense) => {
            const splitsResult = await (0, database_1.query)(`SELECT es.user_id, es.amount, es.share_type, es.is_settled,
                  u.name, u.email
           FROM expense_splits es
           JOIN users u ON es.user_id = u.id
           WHERE es.expense_id = $1`, [expense.id]);
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
                splits: splitsResult.rows.map((s) => ({
                    userId: s.user_id,
                    userName: s.name,
                    amount: parseFloat(s.amount),
                    shareType: s.share_type,
                    isSettled: s.is_settled,
                })),
            };
        }));
        res.json({
            id: group.id,
            name: group.name,
            description: group.description,
            createdBy: group.created_by,
            createdAt: group.created_at,
            members: membersResult.rows.map((m) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                avatarUrl: m.avatar_url,
                role: m.role,
            })),
            expenses: expensesWithSplits,
        });
    }
    catch (error) {
        console.error('Get group by id error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getGroupById = getGroupById;
const deleteGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const result = await (0, database_1.query)('DELETE FROM groups WHERE id = $1 AND created_by = $2 RETURNING id', [groupId, req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found or not authorized' });
        }
        res.json({ message: 'Group deleted successfully' });
    }
    catch (error) {
        console.error('Delete group error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.deleteGroup = deleteGroup;
//# sourceMappingURL=groupController.js.map