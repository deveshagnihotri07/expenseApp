import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';
import { registerUser } from './helpers/factories';

describe('Users API', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  describe('Authentication required', () => {
    it('GET /api/users/profile returns 401 without a token', async () => {
      const res = await request(app).get('/api/users/profile');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('No token, authorization denied');
    });

    it('returns 401 with an invalid token', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Token is not valid');
    });
  });

  describe('GET /api/users/profile', () => {
    it('returns the authenticated user profile', async () => {
      const { token, user } = await registerUser();
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(user.id);
      expect(res.body.email).toBe(user.email);
      expect(res.body.name).toBe(user.name);
      expect(res.body.createdAt).toBeDefined();
    });
  });

  describe('PUT /api/users/profile', () => {
    it('updates the user profile', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Name',
          phone: '555-1234',
          avatar_url: 'https://example.com/avatar.png',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.phone).toBe('555-1234');
      expect(res.body.avatarUrl).toBe('https://example.com/avatar.png');
    });
  });

  describe('GET /api/users/users', () => {
    it('returns the list of all users', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .get('/api/users/users')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).toHaveProperty('email');
    });
  });
});
