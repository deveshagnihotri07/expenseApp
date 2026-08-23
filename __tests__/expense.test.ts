import request from 'supertest';
import app from '../src/app';
import pool from '../src/config/database';

describe('Expense API', () => {
  let token: string;
  let userId: string;
  let groupId: string;

  beforeAll(async () => {
    const email = `expense_test_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Expense Test', email, password: 'password123' })
      .expect(201);

    token = res.body.token;
    userId = res.body.user.id;

    const groupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Expense Group', memberIds: [] })
      .expect(201);
    groupId = groupRes.body.id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM expenses WHERE created_by = $1', [userId]);
    await pool.query('DELETE FROM groups WHERE id = $1', [groupId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  it('should create a personal expense', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Coffee',
        amount: 5.5,
        splits: [{ userId }],
        splitMethod: 'equal',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.amount).toBe(5.5);
  });

  it('should create a group expense with equal split', async () => {
    const secondUser = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Second User',
        email: `expense_second_${Date.now()}@example.com`,
        password: 'password123',
      })
      .expect(201);

    const groupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dinner Group', memberIds: [secondUser.body.user.id] })
      .expect(201);

    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Dinner',
        amount: 60,
        groupId: groupRes.body.id,
        splits: [{ userId }, { userId: secondUser.body.user.id }],
        splitMethod: 'equal',
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.amount).toBe(60);
  });

  it('should reject expense without amount', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'No amount',
        splits: [{ userId }],
        splitMethod: 'equal',
      })
      .expect(400);
  });

  it('should get all expenses sorted newest first', async () => {
    const res = await request(app)
      .get('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.expenses)).toBe(true);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.page).toBe(1);
    expect(typeof res.body.hasMore).toBe('boolean');

    const dates = res.body.expenses.map((e: any) => e.expenseDate);
    const sorted = [...dates].sort((a: string, b: string) => (a < b ? 1 : -1));
    expect(dates).toEqual(sorted);
  });

  it('should paginate expenses', async () => {
    const res = await request(app)
      .get('/api/expenses?page=1&limit=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.expenses.length).toBeLessThanOrEqual(1);
    expect(res.body.limit).toBe(1);
  });

  it('should get expenses for a group', async () => {
    const res = await request(app)
      .get(`/api/expenses?groupId=${groupId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.expenses)).toBe(true);
  });
});
