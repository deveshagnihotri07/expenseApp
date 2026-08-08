import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';
import { registerUser } from './helpers/factories';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Expenses API', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(401);
  });

  describe('POST /api/expenses', () => {
    it('creates a personal expense with equal split', async () => {
      const { token, user } = await registerUser();
      const res = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({
          description: 'Lunch',
          amount: 100,
          currency: 'USD',
          splits: [{ userId: user.id }],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.amount).toBe(100);
      expect(res.body.description).toBe('Lunch');
      expect(res.body.isPersonal).toBe(true);
    });

    it('creates an expense with a percentage split', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Groceries',
          amount: 100,
          splitMethod: 'percentage',
          splits: [
            { userId: user1.user.id, percentage: 60 },
            { userId: user2.user.id, percentage: 40 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(100);

      const detail = await request(app)
        .get(`/api/expenses/${res.body.id}`)
        .set(auth(user1.token));

      expect(detail.status).toBe(200);
      const splitByUser = (id: string) =>
        detail.body.splits.find((s: any) => s.userId === id);
      expect(splitByUser(user1.user.id).amount).toBe(60);
      expect(splitByUser(user2.user.id).amount).toBe(40);
    });

    it('creates an expense with an exact split', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Dinner',
          amount: 100,
          splitMethod: 'exact',
          splits: [
            { userId: user1.user.id, amount: 70 },
            { userId: user2.user.id, amount: 30 },
          ],
        });

      expect(res.status).toBe(201);
    });

    it('creates a group expense', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Hotel',
          amount: 200,
          groupId: groupRes.body.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      expect(res.status).toBe(201);
      expect(res.body.groupId).toBe(groupRes.body.id);
      expect(res.body.isPersonal).toBe(false);
    });

    it('rejects an invalid amount', async () => {
      const { token, user } = await registerUser();
      const res = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({
          description: 'Free lunch',
          amount: 0,
          splits: [{ userId: user.id }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Valid amount is required');
    });

    it('rejects an expense without splits', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({ description: 'No split', amount: 50, splits: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('At least one split is required');
    });

    it('rejects a non-member creating a group expense', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();
      const outsider = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(outsider.token))
        .send({
          description: 'Hotel',
          amount: 200,
          groupId: groupRes.body.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('You are not a member of this group');
    });

    it('rejects a payer who is not a group member', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();
      const outsider = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Hotel',
          amount: 200,
          groupId: groupRes.body.id,
          createdById: outsider.user.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Payer must be a member of the group');
    });

    it('rejects a split participant who is not a group member', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();
      const outsider = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Hotel',
          amount: 200,
          groupId: groupRes.body.id,
          splits: [{ userId: user1.user.id }, { userId: outsider.user.id }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('All split participants must be group members');
    });

    it('rejects a personal expense paid by someone else', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Lunch',
          amount: 50,
          createdById: user2.user.id,
          splits: [{ userId: user1.user.id }],
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Personal expenses must be paid by you');
    });

    it('allows a member to create an expense paid by another member', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      const res = await request(app)
        .post('/api/expenses')
        .set(auth(user2.token))
        .send({
          description: 'Dinner',
          amount: 100,
          groupId: groupRes.body.id,
          createdById: user1.user.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      expect(res.status).toBe(201);
      expect(res.body.createdBy).toBe(user1.user.id);
    });

    it('creates an expense with a backdated expenseDate', async () => {
      const { token, user } = await registerUser();
      const res = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({
          description: 'Old Lunch',
          amount: 45,
          expenseDate: '2026-07-15',
          splits: [{ userId: user.id }],
        });

      expect(res.status).toBe(201);
      expect(new Date(res.body.expenseDate).toISOString().slice(0, 10)).toContain(
        '2026-07'
      );

      const detail = await request(app)
        .get(`/api/expenses/${res.body.id}`)
        .set(auth(token));
      expect(detail.status).toBe(200);
      const localDate = new Date(detail.body.expenseDate);
      const formatted = `${localDate.getFullYear()}-${String(
        localDate.getMonth() + 1
      ).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
      expect(formatted).toBe('2026-07-15');
    });
  });

  describe('GET /api/expenses', () => {
    it('returns personal expenses when no groupId is given', async () => {
      const { token, user } = await registerUser();
      await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({ description: 'Coffee', amount: 5, splits: [{ userId: user.id }] });

      const res = await request(app)
        .get('/api/expenses')
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].description).toBe('Coffee');
      expect(res.body[0].splits).toBeDefined();
    });

    it('returns expenses filtered by groupId', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Group Filter', memberIds: [user2.user.id] });

      await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Group Lunch',
          amount: 40,
          groupId: groupRes.body.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      const res = await request(app)
        .get(`/api/expenses?groupId=${groupRes.body.id}`)
        .set(auth(user1.token));

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].description).toBe('Group Lunch');
      expect(res.body[0].groupId).toBe(groupRes.body.id);
    });
  });

  describe('GET /api/expenses/:expenseId', () => {
    it('returns a single expense with splits', async () => {
      const { token, user } = await registerUser();
      const created = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({ description: 'Snack', amount: 10, splits: [{ userId: user.id }] });

      const res = await request(app)
        .get(`/api/expenses/${created.body.id}`)
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
      expect(res.body.amount).toBe(10);
      expect(res.body.splits.length).toBe(1);
    });

    it('returns 404 for an unknown expense', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .get('/api/expenses/00000000-0000-0000-0000-000000000000')
        .set(auth(token));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Expense not found');
    });
  });

  describe('PUT /api/expenses/:expenseId', () => {
    it('updates an expense the user created', async () => {
      const { token, user } = await registerUser();
      const created = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({ description: 'Before Edit', amount: 10, splits: [{ userId: user.id }] });

      const res = await request(app)
        .put(`/api/expenses/${created.body.id}`)
        .set(auth(token))
        .send({
          description: 'After Edit',
          amount: 25,
          splits: [{ userId: user.id }],
        });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('After Edit');
      expect(res.body.amount).toBe(25);
    });

    it('returns 403 when updating an expense owned by someone else', async () => {
      const { token } = await registerUser();
      const other = await registerUser();

      const created = await request(app)
        .post('/api/expenses')
        .set(auth(other.token))
        .send({ description: 'Not Mine', amount: 30, splits: [{ userId: other.user.id }] });

      const res = await request(app)
        .put(`/api/expenses/${created.body.id}`)
        .set(auth(token))
        .send({ description: 'Hacked', amount: 30, splits: [{ userId: other.user.id }] });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe('Not authorized to edit this expense');
    });

    it('allows a member to update a group expense created by another member', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set(auth(user1.token))
        .send({ name: 'Trip', memberIds: [user2.user.id] });

      const created = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'Hotel',
          amount: 200,
          groupId: groupRes.body.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      const res = await request(app)
        .put(`/api/expenses/${created.body.id}`)
        .set(auth(user2.token))
        .send({
          description: 'Hotel Updated',
          amount: 250,
          groupId: groupRes.body.id,
          createdById: user1.user.id,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Hotel Updated');
      expect(res.body.amount).toBe(250);
    });

    it('returns 404 for an unknown expense', async () => {
      const { token, user } = await registerUser();
      const res = await request(app)
        .put('/api/expenses/00000000-0000-0000-0000-000000000000')
        .set(auth(token))
        .send({ description: 'X', amount: 5, splits: [{ userId: user.id }] });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Expense not found');
    });

    it('rejects an invalid amount', async () => {
      const { token, user } = await registerUser();
      const created = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({ description: 'Original', amount: 10, splits: [{ userId: user.id }] });

      const res = await request(app)
        .put(`/api/expenses/${created.body.id}`)
        .set(auth(token))
        .send({ description: 'Bad', amount: 0, splits: [{ userId: user.id }] });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Valid amount is required');
    });
  });

  describe('POST /api/expenses/:expenseId/settle', () => {
    it('settles an expense split', async () => {
      const user1 = await registerUser();
      const user2 = await registerUser();

      const created = await request(app)
        .post('/api/expenses')
        .set(auth(user1.token))
        .send({
          description: 'To Settle',
          amount: 80,
          splits: [{ userId: user1.user.id }, { userId: user2.user.id }],
        });

      const res = await request(app)
        .post(`/api/expenses/${created.body.id}/settle`)
        .set(auth(user2.token))
        .send({ fromUserId: user2.user.id, amount: 40 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Expense settled successfully');

      const detail = await request(app)
        .get(`/api/expenses/${created.body.id}`)
        .set(auth(user1.token));

      const split = detail.body.splits.find((s: any) => s.userId === user2.user.id);
      expect(split.isSettled).toBe(true);
    });
  });

  describe('DELETE /api/expenses/:expenseId', () => {
    it('deletes an expense the user created', async () => {
      const { token, user } = await registerUser();
      const created = await request(app)
        .post('/api/expenses')
        .set(auth(token))
        .send({ description: 'Delete Me', amount: 20, splits: [{ userId: user.id }] });

      const res = await request(app)
        .delete(`/api/expenses/${created.body.id}`)
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Expense deleted successfully');
    });

    it('returns 404 when deleting an expense owned by someone else', async () => {
      const { token, user } = await registerUser();
      const other = await registerUser();

      const created = await request(app)
        .post('/api/expenses')
        .set(auth(other.token))
        .send({ description: 'Not Mine', amount: 30, splits: [{ userId: other.user.id }] });

      const res = await request(app)
        .delete(`/api/expenses/${created.body.id}`)
        .set(auth(token));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Expense not found or not authorized');
    });
  });
});
