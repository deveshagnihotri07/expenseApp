import request from 'supertest';
import app from '../src/app';
import pool from '../src/config/database';

describe('Category API', () => {
  let token: string;
  let userId: string;

  beforeAll(async () => {
    const email = `category_test_${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Category Test', email, password: 'password123' })
      .expect(201);

    token = res.body.token;
    userId = res.body.user.id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM categories WHERE created_by = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });

  it('should get default categories', async () => {
    const res = await request(app)
      .get('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should create a custom category', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pet Care', icon: 'paw', color: '#FF6B6B' })
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Pet Care');
    expect(res.body.isDefault).toBe(false);
  });

  it('should reject duplicate custom category', async () => {
    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pet Care' })
      .expect(400);
  });

  it('should reject category creation without name', async () => {
    await request(app)
      .post('/api/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ icon: 'paw' })
      .expect(400);
  });
});
