import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';
import { registerUser } from './helpers/factories';

describe('Groups API', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(401);
  });

  describe('POST /api/groups', () => {
    it('creates a group and adds the creator as admin', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Weekend Trip', description: 'Beach trip', memberIds: [] });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Weekend Trip');
      expect(res.body.id).toBeDefined();
      expect(res.body.createdBy).toBeDefined();
    });

    it('creates a group with additional members', async () => {
      const { token } = await registerUser();
      const member = await registerUser();
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'House Bills', memberIds: [member.user.id] });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('House Bills');
    });

    it('rejects a group without a name', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '', memberIds: [] });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects a group with a non-array memberIds', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bad Group', memberIds: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('GET /api/groups', () => {
    it('returns only groups the user is a member of', async () => {
      const creator = await registerUser();
      const otherUser = await registerUser();

      await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${creator.token}`)
        .send({ name: 'My Group', memberIds: [] });

      const res = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${creator.token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].name).toBe('My Group');
      expect(res.body[0].members).toBeDefined();

      const otherRes = await request(app)
        .get('/api/groups')
        .set('Authorization', `Bearer ${otherUser.token}`);

      expect(otherRes.status).toBe(200);
      expect(otherRes.body.length).toBe(0);
    });
  });

  describe('GET /api/groups/:groupId', () => {
    it('returns group details with members and expenses', async () => {
      const { token } = await registerUser();
      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Details Group', memberIds: [] });

      const groupId = groupRes.body.id;
      const res = await request(app)
        .get(`/api/groups/${groupId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Details Group');
      expect(res.body.members.length).toBe(1);
      expect(res.body.expenses).toEqual([]);
    });

    it('returns 404 when the user is not a member', async () => {
      const { token } = await registerUser();
      const other = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${other.token}`)
        .send({ name: 'Private Group', memberIds: [] });

      const res = await request(app)
        .get(`/api/groups/${groupRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Group not found or not a member');
    });
  });

  describe('DELETE /api/groups/:groupId', () => {
    it('deletes a group the user created', async () => {
      const { token } = await registerUser();
      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'To Delete', memberIds: [] });

      const res = await request(app)
        .delete(`/api/groups/${groupRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Group deleted successfully');
    });

    it('returns 404 when deleting a group owned by someone else', async () => {
      const { token } = await registerUser();
      const other = await registerUser();

      const groupRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${other.token}`)
        .send({ name: 'Not Mine', memberIds: [] });

      const res = await request(app)
        .delete(`/api/groups/${groupRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Group not found or not authorized');
    });
  });
});
