"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFriendAnalytics = exports.getMonthlyTrend = exports.getGroupAnalytics = exports.getCategoryAnalytics = exports.getDashboardOverview = void 0;
const database_1 = require("../config/database");
const formatCurrency = (val) => parseFloat(parseFloat(val.toString()).toFixed(2));
const spendTypeFilter = (type) => {
    if (type === 'personal')
        return 'AND e.is_personal = true';
    if (type === 'group')
        return 'AND e.is_personal = false';
    return '';
};
const computeFriendBalances = async (userId) => {
    const splitsAllResult = await (0, database_1.query)(`SELECT e.id, e.created_by, es.user_id as split_user_id, es.amount as split_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE (e.created_by = $1 OR es.user_id = $1) AND es.is_settled = false`, [userId]);
    const byExpense = {};
    for (const row of splitsAllResult.rows) {
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
     WHERE from_user_id = $1 OR to_user_id = $1`, [userId]);
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
    const friendIds = Object.keys(balanceMap).filter((id) => id);
    const nameMap = {};
    if (friendIds.length > 0) {
        const usersResult = await (0, database_1.query)('SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])', [friendIds]);
        for (const u of usersResult.rows) {
            nameMap[u.id] = { name: u.name, email: u.email };
        }
    }
    return friendIds
        .map((friendId) => ({
        userId: friendId,
        name: nameMap[friendId]?.name || 'Unknown',
        email: nameMap[friendId]?.email || '',
        balance: formatCurrency(balanceMap[friendId]),
    }))
        .filter((fb) => Math.abs(fb.balance) > 0.005)
        .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
};
const getDashboardOverview = async (req, res) => {
    try {
        const userId = req.user.id;
        const type = req.query.type || 'both';
        const typeFilter = spendTypeFilter(type);
        const expenseResult = await (0, database_1.query)(`SELECT es.amount, e.currency, e.created_at, e.expense_date, e.is_personal, e.group_id,
              c.name as category_name
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE es.user_id = $1 ${typeFilter}`, [userId]);
        const expenseRows = expenseResult.rows;
        let totalSpent = 0;
        let totalOwed = 0;
        const categoryMap = {};
        for (const row of expenseRows) {
            const amount = parseFloat(row.amount);
            totalSpent += amount;
            const catName = row.category_name || 'Uncategorized';
            categoryMap[catName] = (categoryMap[catName] || 0) + amount;
        }
        const splitsResult = await (0, database_1.query)(`SELECT es.amount, es.is_settled, e.created_by, e.currency
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = $1`, [userId]);
        for (const row of splitsResult.rows) {
            const splitAmount = parseFloat(row.amount);
            if (!row.is_settled && row.created_by !== userId) {
                totalOwed += splitAmount;
            }
        }
        const thisMonthResult = await (0, database_1.query)(`SELECT
         COALESCE(SUM(CASE WHEN e.is_personal THEN es.amount ELSE 0 END), 0) as personal,
         COALESCE(SUM(CASE WHEN e.is_personal THEN 0 ELSE es.amount END), 0) as grp
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = $1
         AND e.expense_date >= date_trunc('month', CURRENT_DATE)
         AND e.expense_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`, [userId]);
        const thisMonth = thisMonthResult.rows[0];
        const monthlySpentPersonal = parseFloat(thisMonth.personal) || 0;
        const monthlySpentGroup = parseFloat(thisMonth.grp) || 0;
        const trendResult = await (0, database_1.query)(`SELECT TO_CHAR(e.expense_date, 'YYYY-MM-DD') as date, SUM(es.amount) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = $1 ${typeFilter}
       GROUP BY date
       ORDER BY date ASC`, [userId]);
        const monthlyData = trendResult.rows.map((row) => ({
            date: row.date,
            amount: formatCurrency(parseFloat(row.total) || 0),
        }));
        const friendBalances = await computeFriendBalances(userId);
        let totalYouOwe = 0;
        let totalOwedToYou = 0;
        for (const fb of friendBalances) {
            if (fb.balance > 0) {
                totalOwedToYou += fb.balance;
            }
            else {
                totalYouOwe += -fb.balance;
            }
        }
        const categoryData = Object.entries(categoryMap)
            .map(([name, amount]) => ({
            name,
            amount: formatCurrency(amount),
        }))
            .sort((a, b) => b.amount - a.amount);
        res.json({
            totalSpent: formatCurrency(totalSpent),
            totalOwed: formatCurrency(totalOwed),
            totalYouOwe: formatCurrency(totalYouOwe),
            totalOwedToYou: formatCurrency(totalOwedToYou),
            monthlySpent: formatCurrency(monthlySpentPersonal + monthlySpentGroup),
            monthlySpentPersonal: formatCurrency(monthlySpentPersonal),
            monthlySpentGroup: formatCurrency(monthlySpentGroup),
            expenseCount: expenseRows.length,
            categoryBreakdown: categoryData,
            monthlyTrend: monthlyData,
            friendBalances,
        });
    }
    catch (error) {
        console.error('Dashboard overview error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getDashboardOverview = getDashboardOverview;
const getCategoryAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = '6months' } = req.query;
        const type = req.query.type || 'both';
        let dateFilter = '';
        if (period === '6months') {
            dateFilter = `AND e.expense_date >= CURRENT_DATE - INTERVAL '6 months'`;
        }
        else if (period === 'year') {
            dateFilter = `AND e.expense_date >= CURRENT_DATE - INTERVAL '1 year'`;
        }
        else if (period === 'month') {
            dateFilter = `AND e.expense_date >= CURRENT_DATE - INTERVAL '1 month'`;
        }
        const result = await (0, database_1.query)(`SELECT c.name as category_name, c.icon, c.color,
              SUM(es.amount) as total_amount,
              COUNT(DISTINCT e.id) as expense_count
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE es.user_id = $1 ${dateFilter} ${spendTypeFilter(type)}
       GROUP BY c.id, c.name, c.icon, c.color
       ORDER BY total_amount DESC`, [userId]);
        const categoryAnalytics = result.rows.map((row) => ({
            name: row.category_name || 'Uncategorized',
            icon: row.icon,
            color: row.color,
            totalAmount: formatCurrency(parseFloat(row.total_amount) || 0),
            expenseCount: parseInt(row.expense_count),
            percentage: parseFloat(row.total_amount) > 0
                ? Math.round((parseFloat(row.total_amount) /
                    result.rows.reduce((sum, r) => sum + parseFloat(r.total_amount), 0)) *
                    100)
                : 0,
        }));
        res.json(categoryAnalytics);
    }
    catch (error) {
        console.error('Category analytics error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getCategoryAnalytics = getCategoryAnalytics;
const getGroupAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await (0, database_1.query)(`SELECT g.name as group_name, g.id as group_id,
              SUM(e.amount) as total_spent,
              COUNT(e.id) as expense_count
       FROM expenses e
       JOIN groups g ON e.group_id = g.id
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1 AND e.created_by = $1
       GROUP BY g.id, g.name
       ORDER BY total_spent DESC`, [userId]);
        const groupAnalytics = result.rows.map((row) => ({
            groupId: row.group_id,
            groupName: row.group_name,
            totalSpent: formatCurrency(parseFloat(row.total_spent) || 0),
            expenseCount: parseInt(row.expense_count),
        }));
        res.json(groupAnalytics);
    }
    catch (error) {
        console.error('Group analytics error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getGroupAnalytics = getGroupAnalytics;
const getMonthlyTrend = async (req, res) => {
    try {
        const userId = req.user.id;
        const type = req.query.type || 'both';
        const result = await (0, database_1.query)(`SELECT TO_CHAR(e.expense_date, 'YYYY-MM-DD') as date, SUM(es.amount) as total_amount
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = $1 ${spendTypeFilter(type)}
       GROUP BY date
       ORDER BY date ASC`, [userId]);
        const monthlyTrend = result.rows.map((row) => ({
            date: row.date,
            amount: formatCurrency(parseFloat(row.total_amount) || 0),
        }));
        res.json(monthlyTrend);
    }
    catch (error) {
        console.error('Monthly trend error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getMonthlyTrend = getMonthlyTrend;
const getFriendAnalytics = async (req, res) => {
    try {
        const userId = req.user.id;
        const friendBalances = await computeFriendBalances(userId);
        res.json(friendBalances.map((fb) => ({
            name: fb.name,
            email: fb.email,
            youOwe: formatCurrency(Math.max(-fb.balance, 0)),
            owedToYou: formatCurrency(Math.max(fb.balance, 0)),
        })));
    }
    catch (error) {
        console.error('Friend analytics error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getFriendAnalytics = getFriendAnalytics;
//# sourceMappingURL=analyticsController.js.map