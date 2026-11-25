"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFriendAnalytics = exports.getMonthlyTrend = exports.getGroupAnalytics = exports.getCategoryAnalytics = exports.getDashboardOverview = void 0;
const database_1 = require("../config/database");
const friendBalanceService_1 = require("../services/friendBalanceService");
const formatCurrency = (val) => parseFloat(parseFloat(val.toString()).toFixed(2));
const spendTypeFilter = (type) => {
    if (type === 'personal')
        return 'AND e.is_personal = true';
    if (type === 'group')
        return 'AND e.is_personal = false';
    return '';
};
const monthYearFilter = (req) => {
    const month = req.query.month ? parseInt(req.query.month, 10) : null;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    if (month && month >= 1 && month <= 12 && year) {
        return `AND EXTRACT(MONTH FROM e.expense_date) = ${month}
            AND EXTRACT(YEAR FROM e.expense_date) = ${year}`;
    }
    return '';
};
const getDashboardOverview = async (req, res) => {
    try {
        const userId = req.user.id;
        const type = req.query.type || 'both';
        const typeFilter = spendTypeFilter(type);
        const monthFilter = monthYearFilter(req);
        const expenseResult = await (0, database_1.query)(`SELECT es.amount, e.currency, e.created_at, e.expense_date, e.is_personal, e.group_id,
              c.name as category_name
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       LEFT JOIN categories c ON e.category_id = c.id
       WHERE es.user_id = $1 ${typeFilter} ${monthFilter}`, [userId]);
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
        const selectedMonth = req.query.month ? parseInt(req.query.month, 10) : null;
        const selectedYear = req.query.year ? parseInt(req.query.year, 10) : null;
        const hasSelectedMonth = selectedMonth && selectedMonth >= 1 && selectedMonth <= 12 && selectedYear;
        const thisMonthResult = await (0, database_1.query)(`SELECT
         COALESCE(SUM(CASE WHEN e.is_personal THEN es.amount ELSE 0 END), 0) as personal,
         COALESCE(SUM(CASE WHEN e.is_personal THEN 0 ELSE es.amount END), 0) as grp
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = $1
         ${hasSelectedMonth
            ? `AND EXTRACT(MONTH FROM e.expense_date) = ${selectedMonth}
              AND EXTRACT(YEAR FROM e.expense_date) = ${selectedYear}`
            : `AND e.expense_date >= date_trunc('month', CURRENT_DATE)
              AND e.expense_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`}`, [userId]);
        const thisMonth = thisMonthResult.rows[0];
        const monthlySpentPersonal = parseFloat(thisMonth.personal) || 0;
        const monthlySpentGroup = parseFloat(thisMonth.grp) || 0;
        const trendResult = await (0, database_1.query)(`SELECT TO_CHAR(e.expense_date, 'YYYY-MM-DD') as date, SUM(es.amount) as total
       FROM expense_splits es
       JOIN expenses e ON es.expense_id = e.id
       WHERE es.user_id = $1 ${typeFilter} ${monthFilter}
       GROUP BY date
       ORDER BY date ASC`, [userId]);
        const monthlyData = trendResult.rows.map((row) => ({
            date: row.date,
            amount: formatCurrency(parseFloat(row.total) || 0),
        }));
        const friendBalances = await (0, friendBalanceService_1.computeFriendBalances)(userId);
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
        const monthFilter = monthYearFilter(req);
        if (monthFilter) {
            dateFilter = monthFilter;
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
        const friendBalances = await (0, friendBalanceService_1.computeFriendBalances)(userId);
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