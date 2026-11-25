import { query } from '../config/database';

const round2 = (val: number) => parseFloat(val.toFixed(2));

export interface FriendBalance {
  userId: string;
  name: string;
  email: string;
  balance: number;
}

export const computeFriendBalances = async (
  userId: string
): Promise<FriendBalance[]> => {
  const splitsAllResult = await query(
    `SELECT e.id, e.created_by, es.user_id as split_user_id, es.amount as split_amount
     FROM expense_splits es
     JOIN expenses e ON es.expense_id = e.id
     WHERE (e.created_by = $1 OR es.user_id = $1) AND es.is_settled = false`,
    [userId]
  );

  const byExpense: Record<
    string,
    { createdBy: string; splits: { userId: string; amount: number }[] }
  > = {};
  for (const row of splitsAllResult.rows) {
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
     WHERE from_user_id = $1 OR to_user_id = $1`,
    [userId]
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

  const friendIds = Object.keys(balanceMap).filter((id) => id);
  const nameMap: Record<string, { name: string; email: string }> = {};
  if (friendIds.length > 0) {
    const usersResult = await query(
      'SELECT id, name, email FROM users WHERE id = ANY($1::uuid[])',
      [friendIds]
    );
    for (const u of usersResult.rows) {
      nameMap[u.id] = { name: u.name, email: u.email };
    }
  }

  return friendIds
    .map((friendId) => ({
      userId: friendId,
      name: nameMap[friendId]?.name || 'Unknown',
      email: nameMap[friendId]?.email || '',
      balance: round2(balanceMap[friendId]),
    }))
    .filter((fb) => Math.abs(fb.balance) > 0.005)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
};
