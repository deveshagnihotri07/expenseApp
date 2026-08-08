import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';
import { registerUser } from './helpers/factories';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const seedExpenseData = async (token: string, user: any) => {
  await request(app)
    .post('/api/expenses')
    .set(auth(token))
    .send({
      description: 'Food',
      amount: 50,
      categoryId: null,
      splits: [{ userId: user.id }],
    });
  await request(app)
    .post('/api/expenses')
    .set(auth(token))
    .send({
      description: 'Travel',
      amount: 150,
      splits: [{ userId: user.id }],
    });
};

describe('Analytics API', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/analytics/dashboard');
    expect(res.status).toBe(401);
  });

  describe('GET /api/analytics/dashboard', () => {
    it('returns dashboard overview for the user', async () => {
      const { token, user } = await registerUser();
      await seedExpenseData(token, user);

      const res = await request(app)
        .get('/api/analytics/dashboard')
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(res.body.totalSpent).toBe(200);
      expect(res.body.expenseCount).toBe(2);
      expect(res.body.totalOwed).toBe(0);
      expect(Array.isArray(res.body.categoryBreakdown)).toBe(true);
      expect(Array.isArray(res.body.monthlyTrend)).toBe(true);
    });

    it('includes this-month personal/group spending and friend balances', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Hotel',
          amount: 200,
          groupId: groupRes.body.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Lunch',
          amount: 50,
          splits: [{ userId: user1.user.id }],
        });

      const res = await request(app)
        .get('/api/analytics/dashboard')
        .set(auth(user1.token));

      expect(res.status).toBe(200);
      expect(res.body.monthlySpentPersonal).toBe(50);
      expect(res.body.monthlySpentGroup).toBe(100);
      expect(res.body.monthlySpent).toBe(150);
      expect(res.body.totalOwedToYou).toBe(100);
      const fb = res.body.friendBalances.find(
        (f: any) => f.name === user2.user.name
      );
      expect(fb).toBeDefined();
      expect(fb.balance).toBe(100);
    });

    it('counts group expenses paid by someone else and supports the type filter', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      await request(app)
        .post('/api/expenses')
        .set(auth(user2.token))
        .send({
          description: 'Hotel',
          amount: 200,
          groupId: groupRes.body.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Lunch',
          amount: 50,
          splits: [{ userId: user1.user.id }],
        });

      const both = await request(app)
        .get('/api/analytics/dashboard?type=both')
        .set(auth(user1.token));
      expect(both.status).toBe(200);
      expect(both.body.totalSpent).toBe(150);
      expect(both.body.monthlySpentGroup).toBe(100);

      const personal = await request(app)
        .get('/api/analytics/dashboard?type=personal')
        .set(auth(user1.token));
      expect(personal.status).toBe(200);
      expect(personal.body.totalSpent).toBe(50);

      const group = await request(app)
        .get('/api/analytics/dashboard?type=group')
        .set(auth(user1.token));
      expect(group.status).toBe(200);
      expect(group.body.totalSpent).toBe(100);
    });
  });

  describe('GET /api/analytics/categories', () => {
    it('returns category analytics', async () => {
      const { token, user } = await registerUser();
      await seedExpenseData(token, user);

      const res = await request(app)
        .get('/api/analytics/categories')
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('totalAmount');
      expect(res.body[0]).toHaveProperty('expenseCount');
    });

    it('supports a period query parameter', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .get('/api/analytics/categories?period=month')
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/analytics/groups', () => {
    it('returns group analytics', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .get('/api/analytics/groups')
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/analytics/monthly-trend', () => {
    it('returns the monthly spending trend', async () => {
      const { token, user } = await registerUser();
      await seedExpenseData(token, user);

      const res = await request(app)
        .get('/api/analytics/monthly-trend')
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].date).toBeDefined();
      expect(res.body[0].amount).toBeDefined();
    });
  });

  describe('GET /api/analytics/friends', () => {
    it('returns friend analytics', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Shared Dinner',
          amount: 60,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      const res = await request(app)
        .get('/api/analytics/friends')
        .set(auth(user1.token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('youOwe');
      expect(res.body[0]).toHaveProperty('owedToYou');
    });
  });
});
