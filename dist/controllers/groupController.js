"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settleGroupMember = exports.getGroupSettlements = exports.getGroupBalances = exports.deleteGroup = exports.addGroupMember = exports.getGroupById = exports.getGroups = exports.createGroup = exports.createGroupValidation = void 0;
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
        let dateFilter = '';
        const expenseParams = [group.id];
        const month = req.query.month ? parseInt(req.query.month, 10) : null;
        const year = req.query.year ? parseInt(req.query.year, 10) : null;
        if (month && month >= 1 && month <= 12 && year) {
            expenseParams.push(month, year);
            dateFilter = ` AND EXTRACT(MONTH FROM e.expense_date) = $${expenseParams.length - 1}
                     AND EXTRACT(YEAR FROM e.expense_date) = $${expenseParams.length}`;
        }
        const summaryResult = await (0, database_1.query)(`SELECT COALESCE(SUM(e.amount), 0) as total_amount,
              COUNT(*) as expense_count,
              COALESCE(SUM(CASE WHEN e.expense_date >= CURRENT_DATE
                           AND e.expense_date < CURRENT_DATE + INTERVAL '1 day'
                          THEN e.amount ELSE 0 END), 0) as today_amount
       FROM expenses e
       WHERE e.group_id = $1 ${dateFilter}`, expenseParams);
        const s = summaryResult.rows[0];
        const categorySummaryResult = await (0, database_1.query)(`SELECT c.name, c.icon, c.color, SUM(e.amount) as amount
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.group_id = $1 ${dateFilter}
       GROUP BY c.name, c.icon, c.color
       ORDER BY amount DESC`, expenseParams);
        const expensesResult = await (0, database_1.query)(`SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
       FROM expenses e
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.group_id = $1 ${dateFilter}
       ORDER BY e.expense_date DESC, e.created_at DESC`, expenseParams);
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
            summary: {
                totalAmount: parseFloat(s.total_amount) || 0,
                expenseCount: parseInt(s.expense_count, 10) || 0,
                todayAmount: parseFloat(s.today_amount) || 0,
                categories: categorySummaryResult.rows.map((row) => ({
                    name: row.name || 'Other',
                    icon: row.icon,
                    color: row.color,
                    amount: parseFloat(row.amount) || 0,
                })),
            },
        });
    }
    catch (error) {
        console.error('Get group by id error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getGroupById = getGroupById;
const addGroupMember = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { userId } = req.body;
        const requesterId = req.user.id;
        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }
        const memberCheck = await (0, database_1.query)('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, requesterId]);
        if (memberCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found or not a member' });
        }
        const userCheck = await (0, database_1.query)('SELECT id FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        const existsCheck = await (0, database_1.query)('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        if (existsCheck.rows.length > 0) {
            return res.status(400).json({ message: 'User is already a member' });
        }
        await (0, database_1.query)(`INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'member')`, [groupId, userId]);
        const newMember = await (0, database_1.query)(`SELECT u.id, u.name, u.email
       FROM users u WHERE u.id = $1`, [userId]);
        res.status(201).json({
            id: newMember.rows[0].id,
            name: newMember.rows[0].name,
            email: newMember.rows[0].email,
            role: 'member',
        });
    }
    catch (error) {
        console.error('Add group member error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.addGroupMember = addGroupMember;
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
const formatMoney = (val) => parseFloat(parseFloat(val.toString()).toFixed(2));
const getGroupBalances = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        const memberCheck = await (0, database_1.query)('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        if (memberCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found or not a member' });
        }
        const membersResult = await (0, database_1.query)(`SELECT gm.user_id, u.name, u.email
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`, [groupId]);
        const splitsResult = await (0, database_1.query)(`SELECT e.id, e.created_by, es.user_id as split_user_id, es.amount as split_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = $1 AND es.is_settled = false`, [groupId]);
        const byExpense = {};
        for (const row of splitsResult.rows) {
            if (!byExpense[row.id]) {
                byExpense[row.id] = { createdBy: row.created_by, splits: [] };
            }
            byExpense[row.id].splits.push({
                userId: row.split_user_id,
                amount: parseFloat(row.split_amount),
            });
        }
        const balanceMap = {};
        for (const exp of Object.values(byExpense)) {
            if (exp.createdBy === userId) {
                for (const s of exp.splits) {
                    if (s.userId !== userId) {
                        balanceMap[s.userId] = (balanceMap[s.userId] || 0) + s.amount;
                    }
                }
            }
            else {
                const mySplit = exp.splits.find((s) => s.userId === userId);
                if (mySplit) {
                    balanceMap[exp.createdBy] =
                        (balanceMap[exp.createdBy] || 0) - mySplit.amount;
                }
            }
        }
        const settleResult = await (0, database_1.query)(`SELECT from_user_id, to_user_id, amount
       FROM settlements
       WHERE group_id = $1 AND (from_user_id = $2 OR to_user_id = $2)`, [groupId, userId]);
        for (const row of settleResult.rows) {
            const amt = parseFloat(row.amount);
            const other = row.from_user_id === userId ? row.to_user_id : row.from_user_id;
            if (row.from_user_id === userId) {
                balanceMap[other] = (balanceMap[other] || 0) + amt;
            }
            else {
                balanceMap[other] = (balanceMap[other] || 0) - amt;
            }
        }
        res.json(membersResult.rows
            .filter((m) => m.user_id !== userId)
            .map((m) => ({
            userId: m.user_id,
            name: m.name,
            email: m.email,
            balance: formatMoney(balanceMap[m.user_id] || 0),
        })));
    }
    catch (error) {
        console.error('Get group balances error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getGroupBalances = getGroupBalances;
const getGroupSettlements = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        const memberCheck = await (0, database_1.query)('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
        if (memberCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Group not found or not a member' });
        }
        const result = await (0, database_1.query)(`SELECT s.id, s.from_user_id, fu.name as from_name,
              s.to_user_id, tu.name as to_name,
              s.amount, TO_CHAR(s.settled_date, 'YYYY-MM-DD') as settled_date,
              s.payment_method
       FROM settlements s
       JOIN users fu ON s.from_user_id = fu.id
       JOIN users tu ON s.to_user_id = tu.id
       WHERE s.group_id = $1
       ORDER BY s.settled_date DESC, s.created_at DESC`, [groupId]);
        res.json(result.rows.map((r) => ({
            id: r.id,
            fromUserId: r.from_user_id,
            fromName: r.from_name,
            toUserId: r.to_user_id,
            toName: r.to_name,
            amount: formatMoney(r.amount),
            date: r.settled_date,
            paymentMethod: r.payment_method,
        })));
    }
    catch (error) {
        console.error('Get group settlements error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getGroupSettlements = getGroupSettlements;
const settleGroupMember = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { memberId, amount, date, paymentMethod } = req.body;
        const userId = req.user.id;
        if (!memberId || memberId === userId) {
            return res.status(400).json({ message: 'Invalid memberId' });
        }
        const settleAmount = Number(amount);
        if (!settleAmount || isNaN(settleAmount) || settleAmount <= 0) {
            return res
                .status(400)
                .json({ message: 'Amount must be a positive number' });
        }
        const memberCheck = await (0, database_1.query)('SELECT user_id FROM group_members WHERE group_id = $1 AND user_id = ANY($2::uuid[])', [groupId, [userId, memberId]]);
        const memberSet = new Set(memberCheck.rows.map((r) => r.user_id));
        if (!memberSet.has(userId) || !memberSet.has(memberId)) {
            return res.status(400).json({ message: 'Both users must be group members' });
        }
        const splitsResult = await (0, database_1.query)(`SELECT e.created_by, es.user_id as split_user_id, es.amount as split_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE e.group_id = $1 AND es.is_settled = false`, [groupId]);
        let balance = 0;
        for (const row of splitsResult.rows) {
            const splitAmount = parseFloat(row.split_amount);
            if (row.created_by === userId && row.split_user_id === memberId) {
                balance += splitAmount;
            }
            else if (row.created_by === memberId && row.split_user_id === userId) {
                balance -= splitAmount;
            }
        }
        const settleHistory = await (0, database_1.query)(`SELECT from_user_id, to_user_id, amount
       FROM settlements
       WHERE group_id = $1
         AND ((from_user_id = $2 AND to_user_id = $3)
              OR (from_user_id = $3 AND to_user_id = $2))`, [groupId, userId, memberId]);
        for (const row of settleHistory.rows) {
            const amt = parseFloat(row.amount);
            if (row.from_user_id === userId) {
                balance += amt;
            }
            else {
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
        await (0, database_1.query)(`INSERT INTO settlements (from_user_id, to_user_id, amount, group_id, settled_date, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6)`, [debtor, creditor, formatMoney(settleAmount), groupId, settlementDate, method]);
        const remaining = outstanding - settleAmount;
        res.json({
            message: 'Settled successfully',
            amount: formatMoney(settleAmount),
            memberId,
            remainingBalance: formatMoney(Math.max(0, remaining)),
            date: settlementDate,
            paymentMethod: method,
        });
    }
    catch (error) {
        console.error('Settle group member error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.settleGroupMember = settleGroupMember;
//# sourceMappingURL=groupController.js.map