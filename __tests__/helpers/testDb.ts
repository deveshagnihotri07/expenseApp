import { getClient } from '../../src/config/database';

export const DEFAULT_CATEGORIES: Array<[string, string, string]> = [
  ['Food & Dining', 'restaurant', '#FF6B6B'],
  ['Transportation', 'car', '#4ECDC4'],
  ['Shopping', 'bag-handle', '#FFE66D'],
  ['Entertainment', 'film', '#9B5DE5'],
  ['Bills & Utilities', 'receipt', '#00BBF9'],
  ['Travel', 'airplane', '#00C9A7'],
  ['Health & Medical', 'heart', '#FF6B6B'],
  ['Education', 'book', '#4ECDC4'],
  ['Personal Care', 'sparkles', '#FFE66D'],
  ['Gifts', 'gift', '#9B5DE5'],
  ['Other', 'more-horizontal', '#CCCCCC'],
];

export const resetDatabase = async (): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `TRUNCATE TABLE settlements, expense_splits, expenses, group_members, groups, categories, users RESTART IDENTITY CASCADE`
    );
    for (const [name, icon, color] of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO categories (name, icon, color, is_default) VALUES ($1, $2, $3, true)`,
        [name, icon, color]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closePool = async (): Promise<void> => {
  const pool = (await import('../../src/config/database')).default;
  await pool.end();
};
