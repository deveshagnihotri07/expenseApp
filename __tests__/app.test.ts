import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';

describe('App root & routing', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it('GET / returns API message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Splitwise Clone API' });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Route not found');
  });
});
