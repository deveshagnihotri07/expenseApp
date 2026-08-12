import request from 'supertest';
import app from '../src/app';
import pool from '../src/config/database';

describe('Auth API', () => {
  beforeAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%_test_%'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE '%_test_%'");
    await pool.end();
  });

  const testUser = {
    name: 'Test User',
    email: `test_${Date.now()}@example.com`,
    password: 'password123',
  };

  let token: string;

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser)
      .expect(201);

    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user).not.toHaveProperty('password_hash');
    token = res.body.token;
  });

  it('should not register duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send(testUser)
      .expect(400);
  });

  it('should login with registered credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(testUser.email);
  });

  it('should reject invalid credentials', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' })
      .expect(400);
  });

  it('should get user profile with token', async () => {
    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe(testUser.email);
  });

  it('should reject profile access without token', async () => {
    await request(app)
      .get('/api/users/profile')
      .expect(401);
  });
});
