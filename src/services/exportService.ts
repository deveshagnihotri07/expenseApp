import ExcelJS from 'exceljs';
import { query } from '../config/database';
import { computeFriendBalances } from './friendBalanceService';

export type ExportScope = 'personal' | 'group' | 'both';
export type ExportStatus = 'all' | 'settled' | 'unsettled';

export interface ExportFilters {
  scope: ExportScope;
  groupId?: string;
  from?: string;
  to?: string;
  month?: number;
  year?: number;
  categoryId?: string;
  status?: ExportStatus;
}

type Row = Record<string, any>;

interface ColumnDef {
  header: string;
  key: string;
  width?: number;
  numFmt?: string;
}

const ACCENT = 'FF4F46E5';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: ACCENT },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
};
const ROW_BORDER: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
};
const MONEY_FMT = '#,##0.00';
const DATE_FMT = 'yyyy-mm-dd';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const toNumber = (value: any): number => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isoDate = (value: any): string => {
  const date = toDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'group';

const addTableSheet = (
  workbook: ExcelJS.Workbook,
  name: string,
  columns: ColumnDef[],
  rows: Row[],
  totalRow?: Row
): ExcelJS.Worksheet => {
  const ws = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? 18,
  }));

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  rows.forEach((row) => ws.addRow(row));

  for (let i = 2; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    row.eachCell((cell, colNumber) => {
      const def = columns[colNumber - 1];
      if (def?.numFmt) cell.numFmt = def.numFmt;
      cell.border = ROW_BORDER;
      if (i % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF9FAFB' },
        };
      }
    });
  }

  if (totalRow) {
    const row = ws.addRow(totalRow);
    row.font = { bold: true };
    for (let colNumber = 1; colNumber <= columns.length; colNumber++) {
      const cell = row.getCell(colNumber);
      const def = columns[colNumber - 1];
      if (def?.numFmt) cell.numFmt = def.numFmt;
      cell.border = { top: { style: 'medium', color: { argb: 'FF9CA3AF' } } };
    }
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  return ws;
};

interface SummaryInput {
  userName: string;
  generatedAt: Date;
  periodLabel: string;
  scope: ExportScope;
  groupName?: string;
  status: ExportStatus;
  categoryName: string;
  currency: string;
  totalSpent: number;
  totalPaid: number;
  totalYouOwe: number;
  totalOwedToYou: number;
  expenseCount: number;
  avgPerDay: number;
  topCategory: string;
}

const addSummarySheet = (
  workbook: ExcelJS.Workbook,
  data: SummaryInput
): void => {
  const ws = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 32 }, { width: 30 }];

  ws.mergeCells('A1:B1');
  const title = ws.getCell('A1');
  title.value = 'SpendTracker Export';
  title.font = { bold: true, size: 20, color: { argb: ACCENT } };
  ws.getRow(1).height = 30;

  ws.mergeCells('A2:B2');
  const subtitle = ws.getCell('A2');
  subtitle.value = `Generated for ${data.userName} on ${data.generatedAt.toLocaleString()}`;
  subtitle.font = { size: 10, color: { argb: 'FF6B7280' } };

  let cursor = 4;
  const section = (label: string) => {
    const cell = ws.getCell(`A${cursor}`);
    cell.value = label;
    cell.font = { bold: true, size: 12, color: { argb: ACCENT } };
    ws.getRow(cursor).height = 20;
    cursor += 1;
  };

  const item = (label: string, value: any, numFmt?: string) => {
    const labelCell = ws.getCell(`A${cursor}`);
    labelCell.value = label;
    labelCell.font = { color: { argb: 'FF374151' } };
    const valueCell = ws.getCell(`B${cursor}`);
    valueCell.value = value;
    valueCell.font = { bold: true, color: { argb: 'FF111827' } };
    if (numFmt) valueCell.numFmt = numFmt;
    cursor += 1;
  };

  section('Export details');
  item('Period', data.periodLabel);
  item('Scope', data.scope.charAt(0).toUpperCase() + data.scope.slice(1));
  if (data.groupName) item('Group', data.groupName);
  item('Status', data.status.charAt(0).toUpperCase() + data.status.slice(1));
  item('Category', data.categoryName);
  item('Currency', data.currency);
  cursor += 1;

  section('Totals');
  item('Total spent (your share)', round2(data.totalSpent), MONEY_FMT);
  item('Total paid by you', round2(data.totalPaid), MONEY_FMT);
  item('You owe', round2(data.totalYouOwe), MONEY_FMT);
  item('Owed to you', round2(data.totalOwedToYou), MONEY_FMT);
  item('Net balance', round2(data.totalOwedToYou - data.totalYouOwe), MONEY_FMT);
  item('Expense count', data.expenseCount);
  item('Average per day', round2(data.avgPerDay), MONEY_FMT);
  item('Top category', data.topCategory);
};

export interface ExportResult {
  workbook: ExcelJS.Workbook;
  filename: string;
  expenseCount: number;
}

const computePeriodDays = (filters: ExportFilters, dates: Set<string>): number => {
  if (filters.from && filters.to) {
    const from = toDate(filters.from);
    const to = toDate(filters.to);
    if (from && to) {
      const diff = Math.round((to.getTime() - from.getTime()) / 86400000);
      return Math.max(1, diff + 1);
    }
  }
  if (filters.month && filters.year) {
    return new Date(filters.year, filters.month, 0).getDate();
  }
  return Math.max(1, dates.size);
};

export const buildExportWorkbook = async (
  userId: string,
  userName: string,
  filters: ExportFilters
): Promise<ExportResult> => {
  const params: any[] = [];
  const p = (value: any): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const meJoin = p(userId);

  let scopeClause: string;
  if (filters.scope === 'personal') {
    const u = p(userId);
    scopeClause = `(e.is_personal = true AND e.created_by = ${u})`;
  } else if (filters.scope === 'group') {
    if (filters.groupId) {
      const g = p(filters.groupId);
      scopeClause = `e.group_id = ${g}`;
    } else {
      const u = p(userId);
      scopeClause = `e.group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = ${u})`;
    }
  } else {
    const u1 = p(userId);
    const u2 = p(userId);
    scopeClause = `((e.is_personal = true AND e.created_by = ${u1}) OR e.group_id IN (SELECT gm.group_id FROM group_members gm WHERE gm.user_id = ${u2}))`;
  }

  const conditions = [scopeClause];
  if (filters.from) conditions.push(`e.expense_date >= ${p(filters.from)}`);
  if (filters.to) conditions.push(`e.expense_date <= ${p(filters.to)}`);
  if (filters.month && filters.year) {
    conditions.push(`EXTRACT(MONTH FROM e.expense_date) = ${p(filters.month)}`);
    conditions.push(`EXTRACT(YEAR FROM e.expense_date) = ${p(filters.year)}`);
  }
  if (filters.categoryId) conditions.push(`e.category_id = ${p(filters.categoryId)}`);
  if (filters.status === 'settled') conditions.push('e.is_settled = true');
  if (filters.status === 'unsettled') conditions.push('e.is_settled = false');

  const where = conditions.join(' AND ');

  const expenseResult = await query(
    `SELECT e.id, e.description, e.amount, e.currency, e.expense_date, e.created_at,
            e.is_personal, e.is_settled, e.group_id, e.created_by,
            c.name AS category_name, g.name AS group_name,
            payer.name AS paid_by_name,
            me_split.amount AS my_share,
            me_split.share_type AS my_share_type,
            me_split.is_settled AS my_share_settled
     FROM expenses e
     LEFT JOIN categories c ON e.category_id = c.id
     LEFT JOIN groups g ON e.group_id = g.id
     LEFT JOIN users payer ON e.created_by = payer.id
     LEFT JOIN expense_splits me_split
       ON me_split.expense_id = e.id AND me_split.user_id = ${meJoin}
     WHERE ${where}
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    params
  );

  const expenses = expenseResult.rows;
  const expenseIds = expenses.map((row: any) => row.id);

  let splitRows: Row[] = [];
  if (expenseIds.length > 0) {
    const splitsResult = await query(
      `SELECT es.expense_id, es.amount, es.share_type, es.is_settled,
              u.name AS user_name, u.email
       FROM expense_splits es
       JOIN users u ON es.user_id = u.id
       WHERE es.expense_id = ANY($1::uuid[])
       ORDER BY u.name ASC`,
      [expenseIds]
    );
    splitRows = splitsResult.rows;
  }

  const splitsByExpense: Record<string, Row[]> = {};
  for (const split of splitRows) {
    if (!splitsByExpense[split.expense_id]) {
      splitsByExpense[split.expense_id] = [];
    }
    splitsByExpense[split.expense_id].push(split);
  }

  const expenseById: Record<string, any> = {};
  for (const row of expenses) expenseById[row.id] = row;

  const currencyCount: Record<string, number> = {};
  const categoryMap: Record<string, { amount: number; count: number }> = {};
  const monthMap: Record<
    string,
    { amount: number; personal: number; group: number; count: number }
  > = {};
  const groupMap: Record<string, { total: number; myShare: number; count: number }> =
    {};
  const activeDates = new Set<string>();

  let totalSpent = 0;
  let totalPaid = 0;

  const expenseSheetRows: Row[] = [];

  for (const row of expenses) {
    const amount = toNumber(row.amount);
    const myShare =
      row.my_share != null
        ? toNumber(row.my_share)
        : row.is_personal
        ? amount
        : 0;
    const currency = row.currency || 'INR';
    const categoryName = row.category_name || 'Uncategorized';
    const groupName = row.is_personal ? 'Personal' : row.group_name || 'Group';
    const expenseDate = isoDate(row.expense_date);

    totalSpent += myShare;
    if (row.created_by === userId) totalPaid += amount;
    currencyCount[currency] = (currencyCount[currency] || 0) + 1;
    activeDates.add(expenseDate);

    if (!categoryMap[categoryName]) {
      categoryMap[categoryName] = { amount: 0, count: 0 };
    }
    categoryMap[categoryName].amount += myShare;
    categoryMap[categoryName].count += 1;

    const monthKey = expenseDate.slice(0, 7) || 'Unknown';
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = { amount: 0, personal: 0, group: 0, count: 0 };
    }
    monthMap[monthKey].amount += myShare;
    monthMap[monthKey].count += 1;
    if (row.is_personal) monthMap[monthKey].personal += myShare;
    else monthMap[monthKey].group += myShare;

    if (!groupMap[groupName]) {
      groupMap[groupName] = { total: 0, myShare: 0, count: 0 };
    }
    groupMap[groupName].total += amount;
    groupMap[groupName].myShare += myShare;
    groupMap[groupName].count += 1;

    expenseSheetRows.push({
      date: toDate(row.expense_date),
      description: row.description || '',
      category: categoryName,
      group: row.is_personal ? 'Personal' : row.group_name || '',
      paidBy: row.paid_by_name || '',
      amount: round2(amount),
      currency,
      yourShare: round2(myShare),
      splitMethod: row.my_share_type || 'equal',
      settled: row.is_settled ? 'Yes' : 'No',
      _id: row.id,
    });
  }

  const categoryRows = Object.entries(categoryMap)
    .map(([name, value]) => ({
      category: name,
      total: round2(value.amount),
      transactions: value.count,
      percentage:
        totalSpent > 0 ? round2((value.amount / totalSpent) * 100) : 0,
      average: value.count > 0 ? round2(value.amount / value.count) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const monthRows = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month,
      total: round2(value.amount),
      personal: round2(value.personal),
      group: round2(value.group),
      transactions: value.count,
    }));

  const groupRows = Object.entries(groupMap)
    .map(([name, value]) => ({
      group: name,
      total: round2(value.total),
      yourShare: round2(value.myShare),
      transactions: value.count,
    }))
    .sort((a, b) => b.total - a.total);

  const friendBalances = await computeFriendBalances(userId);
  const friendRows = friendBalances.map((fb) => ({
    friend: fb.name,
    email: fb.email,
    youOwe: round2(Math.max(-fb.balance, 0)),
    owedToYou: round2(Math.max(fb.balance, 0)),
    net: round2(fb.balance),
  }));
  const totalYouOwe = friendRows.reduce((sum, row) => sum + row.youOwe, 0);
  const totalOwedToYou = friendRows.reduce((sum, row) => sum + row.owedToYou, 0);

  const settlementParams: any[] = [userId];
  const settlementConds = ['(s.from_user_id = $1 OR s.to_user_id = $1)'];
  if (filters.from) {
    settlementParams.push(filters.from);
    settlementConds.push(`s.settled_date >= $${settlementParams.length}`);
  }
  if (filters.to) {
    settlementParams.push(filters.to);
    settlementConds.push(`s.settled_date <= $${settlementParams.length}`);
  }
  if (filters.month && filters.year) {
    settlementParams.push(filters.month);
    settlementConds.push(
      `EXTRACT(MONTH FROM s.settled_date) = $${settlementParams.length}`
    );
    settlementParams.push(filters.year);
    settlementConds.push(
      `EXTRACT(YEAR FROM s.settled_date) = $${settlementParams.length}`
    );
  }

  const settlementResult = await query(
    `SELECT s.id, s.amount, s.settled_date, s.payment_method,
            s.from_user_id, s.to_user_id,
            fu.name AS from_name, tu.name AS to_name, g.name AS group_name
     FROM settlements s
     JOIN users fu ON s.from_user_id = fu.id
     JOIN users tu ON s.to_user_id = tu.id
     LEFT JOIN groups g ON s.group_id = g.id
     WHERE ${settlementConds.join(' AND ')}
     ORDER BY s.settled_date DESC, s.created_at DESC`,
    settlementParams
  );

  const settlementRows = settlementResult.rows.map((row: any) => ({
    date: toDate(row.settled_date),
    from: row.from_name,
    to: row.to_name,
    amount: round2(toNumber(row.amount)),
    method: row.payment_method || 'Other',
    group: row.group_name || '',
    direction: row.from_user_id === userId ? 'You paid' : 'You received',
  }));

  const splitSheetRows: Row[] = [];
  const rawRows: Row[] = [];

  for (const row of expenses) {
    const parent = expenseById[row.id];
    const splits = splitsByExpense[row.id] || [];
    const currency = parent.currency || 'INR';
    const categoryName = parent.category_name || 'Uncategorized';
    const groupName = parent.is_personal ? 'Personal' : parent.group_name || '';
    const expenseDate = toDate(parent.expense_date);

    if (splits.length === 0) {
      rawRows.push({
        date: expenseDate,
        description: parent.description || '',
        category: categoryName,
        group: groupName,
        paidBy: parent.paid_by_name || '',
        participant: '',
        shareAmount: round2(toNumber(parent.amount)),
        shareType: '',
        settled: parent.is_settled ? 'Yes' : 'No',
        currency,
        expenseTotal: round2(toNumber(parent.amount)),
        createdAt: toDate(parent.created_at),
      });
      continue;
    }

    for (const split of splits) {
      splitSheetRows.push({
        date: expenseDate,
        description: parent.description || '',
        participant: split.user_name,
        amount: round2(toNumber(split.amount)),
        shareType: split.share_type || 'equal',
        settled: split.is_settled ? 'Yes' : 'No',
        currency,
      });

      rawRows.push({
        date: expenseDate,
        description: parent.description || '',
        category: categoryName,
        group: groupName,
        paidBy: parent.paid_by_name || '',
        participant: split.user_name,
        shareAmount: round2(toNumber(split.amount)),
        shareType: split.share_type || 'equal',
        settled: split.is_settled ? 'Yes' : 'No',
        currency,
        expenseTotal: round2(toNumber(parent.amount)),
        createdAt: toDate(parent.created_at),
      });
    }
  }

  const periodDays = computePeriodDays(filters, activeDates);
  const avgPerDay = periodDays > 0 ? totalSpent / periodDays : 0;

  const currency =
    Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'INR';

  const topCategory = categoryRows[0]?.category || '—';

  let periodLabel = 'All time';
  if (filters.from || filters.to) {
    periodLabel = `${filters.from || 'Beginning'} → ${filters.to || 'Today'}`;
  } else if (filters.month && filters.year) {
    periodLabel = `${MONTH_NAMES[filters.month - 1]} ${filters.year}`;
  }

  let groupName: string | undefined;
  if (filters.scope === 'group' && filters.groupId) {
    const groupResult = await query('SELECT name FROM groups WHERE id = $1', [
      filters.groupId,
    ]);
    groupName = groupResult.rows[0]?.name;
  }

  let categoryName = 'All categories';
  if (filters.categoryId) {
    const categoryResult = await query('SELECT name FROM categories WHERE id = $1', [
      filters.categoryId,
    ]);
    categoryName = categoryResult.rows[0]?.name || 'Selected category';
  }

  const generatedAt = new Date();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SpendTracker';
  workbook.created = generatedAt;

  addSummarySheet(workbook, {
    userName,
    generatedAt,
    periodLabel,
    scope: filters.scope,
    groupName,
    status: filters.status || 'all',
    categoryName,
    currency,
    totalSpent,
    totalPaid,
    totalYouOwe,
    totalOwedToYou,
    expenseCount: expenses.length,
    avgPerDay,
    topCategory,
  });

  addTableSheet(
    workbook,
    'Expenses',
    [
      { header: 'Date', key: 'date', width: 13, numFmt: DATE_FMT },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Group', key: 'group', width: 20 },
      { header: 'Paid By', key: 'paidBy', width: 20 },
      { header: 'Amount', key: 'amount', width: 14, numFmt: MONEY_FMT },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Your Share', key: 'yourShare', width: 14, numFmt: MONEY_FMT },
      { header: 'Split Method', key: 'splitMethod', width: 14 },
      { header: 'Settled', key: 'settled', width: 10 },
    ],
    expenseSheetRows.map(({ _id, ...rest }) => rest),
    {
      date: 'TOTAL',
      amount: round2(expenseSheetRows.reduce((sum, row) => sum + row.amount, 0)),
      yourShare: round2(totalSpent),
    }
  );

  addTableSheet(
    workbook,
    'Splits',
    [
      { header: 'Date', key: 'date', width: 13, numFmt: DATE_FMT },
      { header: 'Expense', key: 'description', width: 30 },
      { header: 'Participant', key: 'participant', width: 22 },
      { header: 'Amount', key: 'amount', width: 14, numFmt: MONEY_FMT },
      { header: 'Share Type', key: 'shareType', width: 14 },
      { header: 'Settled', key: 'settled', width: 10 },
      { header: 'Currency', key: 'currency', width: 10 },
    ],
    splitSheetRows
  );

  addTableSheet(
    workbook,
    'Categories',
    [
      { header: 'Category', key: 'category', width: 24 },
      { header: 'Total', key: 'total', width: 16, numFmt: MONEY_FMT },
      { header: 'Transactions', key: 'transactions', width: 14 },
      { header: 'Percentage', key: 'percentage', width: 13, numFmt: '0.00"%"' },
      { header: 'Avg / Transaction', key: 'average', width: 18, numFmt: MONEY_FMT },
    ],
    categoryRows,
    {
      category: 'TOTAL',
      total: round2(categoryRows.reduce((sum, row) => sum + row.total, 0)),
      transactions: categoryRows.reduce((sum, row) => sum + row.transactions, 0),
      percentage: 100,
    }
  );

  addTableSheet(
    workbook,
    'Monthly Trend',
    [
      { header: 'Month', key: 'month', width: 13 },
      { header: 'Total', key: 'total', width: 16, numFmt: MONEY_FMT },
      { header: 'Personal', key: 'personal', width: 16, numFmt: MONEY_FMT },
      { header: 'Group', key: 'group', width: 16, numFmt: MONEY_FMT },
      { header: 'Transactions', key: 'transactions', width: 14 },
    ],
    monthRows
  );

  addTableSheet(
    workbook,
    'Groups',
    [
      { header: 'Group', key: 'group', width: 26 },
      { header: 'Total', key: 'total', width: 16, numFmt: MONEY_FMT },
      { header: 'Your Share', key: 'yourShare', width: 16, numFmt: MONEY_FMT },
      { header: 'Transactions', key: 'transactions', width: 14 },
    ],
    groupRows
  );

  addTableSheet(
    workbook,
    'Friend Balances',
    [
      { header: 'Friend', key: 'friend', width: 24 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'You Owe', key: 'youOwe', width: 16, numFmt: MONEY_FMT },
      { header: 'Owed To You', key: 'owedToYou', width: 16, numFmt: MONEY_FMT },
      { header: 'Net', key: 'net', width: 16, numFmt: MONEY_FMT },
    ],
    friendRows,
    {
      friend: 'TOTAL',
      youOwe: round2(totalYouOwe),
      owedToYou: round2(totalOwedToYou),
      net: round2(totalOwedToYou - totalYouOwe),
    }
  );

  addTableSheet(
    workbook,
    'Settlements',
    [
      { header: 'Date', key: 'date', width: 13, numFmt: DATE_FMT },
      { header: 'From', key: 'from', width: 22 },
      { header: 'To', key: 'to', width: 22 },
      { header: 'Amount', key: 'amount', width: 14, numFmt: MONEY_FMT },
      { header: 'Method', key: 'method', width: 16 },
      { header: 'Group', key: 'group', width: 20 },
      { header: 'Direction', key: 'direction', width: 14 },
    ],
    settlementRows,
    {
      date: 'TOTAL',
      amount: round2(settlementRows.reduce((sum, row) => sum + row.amount, 0)),
    }
  );

  addTableSheet(
    workbook,
    'Raw Data',
    [
      { header: 'Date', key: 'date', width: 13, numFmt: DATE_FMT },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Group', key: 'group', width: 20 },
      { header: 'Paid By', key: 'paidBy', width: 20 },
      { header: 'Participant', key: 'participant', width: 22 },
      { header: 'Share Amount', key: 'shareAmount', width: 15, numFmt: MONEY_FMT },
      { header: 'Share Type', key: 'shareType', width: 13 },
      { header: 'Settled', key: 'settled', width: 10 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Expense Total', key: 'expenseTotal', width: 15, numFmt: MONEY_FMT },
      { header: 'Created At', key: 'createdAt', width: 18, numFmt: 'yyyy-mm-dd hh:mm' },
    ],
    rawRows
  );

  const datePart = generatedAt.toISOString().slice(0, 10);
  const scopePart =
    filters.scope === 'group' && groupName ? slugify(groupName) : filters.scope;
  const filename = `SpendTracker_${scopePart}_${datePart}.xlsx`;

  return { workbook, filename, expenseCount: expenses.length };
};
