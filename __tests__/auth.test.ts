import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';
import { uniqueEmail } from './helpers/factories';

describe('Auth API', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user and returns a token', async () => {
      const email = uniqueEmail();
      const res = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email,
        password: 'password123',
      });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user).toMatchObject({
        name: 'John Doe',
        email,
      });
      expect(res.body.user.id).toBeDefined();
      expect(res.body.user.password_hash).toBeUndefined();
    });

    it('rejects registration with missing name', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: uniqueEmail(),
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.some((e: any) => e.msg.includes('Name'))).toBe(true);
    });

    it('rejects registration with an invalid email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: 'not-an-email',
        password: 'password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects registration with a short password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email: uniqueEmail(),
        password: '123',
      });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects duplicate email registration', async () => {
      const email = uniqueEmail();
      await request(app).post('/api/auth/register').send({
        name: 'John Doe',
        email,
        password: 'password123',
      });

      const res = await request(app).post('/api/auth/register').send({
        name: 'John Doe 2',
        email,
        password: 'password456',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('User already exists');
    });
  });

  describe('POST /api/auth/login', () => {
    const email = uniqueEmail();

    beforeAll(async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Jane Doe',
        email,
        password: 'password123',
      });
    });

    it('logs in with valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email,
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(email);
    });

    it('rejects a wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email,
        password: 'wrong-password',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('rejects login for an unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: uniqueEmail(), password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('rejects login with a missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });
});
