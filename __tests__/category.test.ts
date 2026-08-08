import request from 'supertest';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';
import { registerUser } from './helpers/factories';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Categories API', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(401);
  });

  describe('GET /api/categories', () => {
    it('returns default categories', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .get('/api/categories')
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.some((c: any) => c.name === 'Food & Dining')).toBe(true);
      expect(res.body.some((c: any) => c.isDefault === true)).toBe(true);
    });
  });

  describe('POST /api/categories', () => {
    it('creates a custom category', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({ name: 'Pets', icon: 'paw', color: '#123456' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Pets');
      expect(res.body.isDefault).toBe(false);
    });

    it('rejects a category without a name', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Category name is required');
    });

    it('rejects a duplicate category name', async () => {
      const { token } = await registerUser();
      await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({ name: 'Duplicate' });

      const res = await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({ name: 'Duplicate' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Category already exists');
    });
  });

  describe('PUT /api/categories/:categoryId', () => {
    it('updates a custom category', async () => {
      const { token } = await registerUser();
      const created = await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({ name: 'Before Edit' });

      const res = await request(app)
        .put(`/api/categories/${created.body.id}`)
        .set(auth(token))
        .send({ name: 'After Edit', icon: 'paw', color: '#111111' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('After Edit');
      expect(res.body.icon).toBe('paw');
    });

    it('rejects a duplicate category name on update', async () => {
      const { token } = await registerUser();
      await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({ name: 'Taken' });
      const created = await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({ name: 'Original' });

      const res = await request(app)
        .put(`/api/categories/${created.body.id}`)
        .set(auth(token))
        .send({ name: 'Taken' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Category already exists');
    });

    it('cannot edit a default category', async () => {
      const { token } = await registerUser();
      const list = await request(app)
        .get('/api/categories')
        .set(auth(token));
      const defaultCat = list.body.find((c: any) => c.isDefault === true);

      const res = await request(app)
        .put(`/api/categories/${defaultCat.id}`)
        .set(auth(token))
        .send({ name: 'Hacked Default' });

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Category not found or cannot be edited');
    });

    it('cannot edit a category owned by someone else', async () => {
      const { token } = await registerUser();
      const other = await registerUser();
      const created = await request(app)
        .post('/api/categories')
        .set(auth(other.token))
        .send({ name: 'Their Category' });

      const res = await request(app)
        .put(`/api/categories/${created.body.id}`)
        .set(auth(token))
        .send({ name: 'Stolen' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/categories/:categoryId', () => {
    it('deletes a custom category', async () => {
      const { token } = await registerUser();
      const created = await request(app)
        .post('/api/categories')
        .set(auth(token))
        .send({ name: 'To Remove' });

      const res = await request(app)
        .delete(`/api/categories/${created.body.id}`)
        .set(auth(token));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Category deleted successfully');
    });

    it('cannot delete a default category', async () => {
      const { token } = await registerUser();
      const list = await request(app)
        .get('/api/categories')
        .set(auth(token));

      const defaultCat = list.body.find((c: any) => c.isDefault === true);

      const res = await request(app)
        .delete(`/api/categories/${defaultCat.id}`)
        .set(auth(token));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Category not found or cannot be deleted');
    });
  });
});
