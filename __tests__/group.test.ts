import request from 'supertest';
import app from '../src/app';
import pool from '../src/config/database';

describe('Group API', () => {
  let token: string;
  let userId: string;
  let friendId: string;
  let groupId: string;

  beforeAll(async () => {
    const email = `group_test_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Group Test', email, password: 'password123' })
      .expect(201);

    token = res.body.token;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    const ids = [userId, friendId].filter(Boolean);
    await pool.query(
      'DELETE FROM settlements WHERE from_user_id = ANY($1::uuid[]) OR to_user_id = ANY($1::uuid[])',
      [ids]
    );
    await pool.query('DELETE FROM expense_splits WHERE user_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM expenses WHERE created_by = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM group_members WHERE user_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM groups WHERE created_by = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    await pool.end();
  });

  it('should create a group', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Trip Group', memberIds: [] })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Trip Group');
  });

  it('should reject group creation without name', async () => {
    await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ memberIds: [] })
      .expect(400);
  });

  it('should get all groups for user', async () => {
    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should reject group access without token', async () => {
    await request(app)
      .get('/api/groups')
      .expect(401);
  });

  it('should settle a partial amount with date and payment method', async () => {
    const friend = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Friend',
        email: `group_friend_${Date.now()}@example.com`,
        password: 'password123',
      })
      .expect(201);
    friendId = friend.body.user.id;

    const groupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Settle Group', memberIds: [friendId] })
      .expect(201);
    groupId = groupRes.body.id;

    await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Hotel',
        amount: 100,
        groupId,
        splits: [{ userId }, { userId: friendId }],
        splitMethod: 'equal',
      })
      .expect(201);

    const settle = await request(app)
      .post(`/api/groups/${groupId}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: friendId,
        amount: 20,
        date: '2026-01-15',
        paymentMethod: 'UPI',
      })
      .expect(200);

    expect(parseFloat(settle.body.amount)).toBe(20);
    expect(parseFloat(settle.body.remainingBalance)).toBeCloseTo(30);
    expect(settle.body.paymentMethod).toBe('UPI');

    const history = await request(app)
      .get(`/api/groups/${groupId}/settlements`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.length).toBeGreaterThan(0);
    expect(parseFloat(history.body[0].amount)).toBe(20);
    expect(history.body[0].date).toBe('2026-01-15');
    expect(history.body[0].paymentMethod).toBe('UPI');
    expect(history.body[0].fromName).toBeDefined();
    expect(history.body[0].toName).toBeDefined();

    const balances = await request(app)
      .get(`/api/groups/${groupId}/balances`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const friendBalance = balances.body.find((b: any) => b.userId === friendId);
    expect(parseFloat(friendBalance.balance)).toBeCloseTo(30);

    await request(app)
      .post(`/api/groups/${groupId}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ memberId: friendId, amount: 31 })
      .expect(400);
  });

  it('should settle when the user owes the member', async () => {
    const friend = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Friend 2',
        email: `group_friend2_${Date.now()}@example.com`,
        password: 'password123',
      })
      .expect(201);
    const friend2Id = friend.body.user.id;

    const groupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Reverse Settle Group', memberIds: [friend2Id] })
      .expect(201);
    const reverseGroupId = groupRes.body.id;

    const friendToken = friend.body.token;

    await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${friendToken}`)
      .send({
        description: 'Dinner',
        amount: 100,
        groupId: reverseGroupId,
        splits: [{ userId: friend2Id }, { userId }],
        splitMethod: 'equal',
      })
      .expect(201);

    const settle = await request(app)
      .post(`/api/groups/${reverseGroupId}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        memberId: friend2Id,
        amount: 25,
        date: '2026-02-10',
        paymentMethod: 'Bank Transfer',
      })
      .expect(200);

    expect(parseFloat(settle.body.amount)).toBe(25);
    expect(parseFloat(settle.body.remainingBalance)).toBeCloseTo(25);

    const balances = await request(app)
      .get(`/api/groups/${reverseGroupId}/balances`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const friendBalance = balances.body.find((b: any) => b.userId === friend2Id);
    expect(parseFloat(friendBalance.balance)).toBeCloseTo(-25);

    await pool.query('DELETE FROM settlements WHERE group_id = $1', [reverseGroupId]);
    await pool.query('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = $1)', [reverseGroupId]);
    await pool.query('DELETE FROM expenses WHERE group_id = $1', [reverseGroupId]);
    await pool.query('DELETE FROM group_members WHERE group_id = $1', [reverseGroupId]);
    await pool.query('DELETE FROM groups WHERE id = $1', [reverseGroupId]);
    await pool.query('DELETE FROM users WHERE id = $1', [friend2Id]);
  });

  it('should add an existing user as a group member', async () => {
    const friend = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'New Member',
        email: `group_newmember_${Date.now()}@example.com`,
        password: 'password123',
      })
      .expect(201);
    const newMemberId = friend.body.user.id;

    const groupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Add Member Group', memberIds: [] })
      .expect(201);
    const gId = groupRes.body.id;

    await request(app)
      .post(`/api/groups/${gId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: newMemberId })
      .expect(201);

    await request(app)
      .post(`/api/groups/${gId}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: newMemberId })
      .expect(400);

    await pool.query('DELETE FROM group_members WHERE group_id = $1', [gId]);
    await pool.query('DELETE FROM groups WHERE id = $1', [gId]);
    await pool.query('DELETE FROM users WHERE id = $1', [newMemberId]);
  });
});
