import request from 'supertest';
import app from '../../src/app';

let counter = 0;

export const uniqueEmail = (): string =>
  `test_${Date.now()}_${counter++}@example.com`;

export interface RegisterResult {
  res: request.Response;
  token: string;
  user: any;
  email: string;
}

export const registerUser = async (
  overrides: Record<string, any> = {}
): Promise<RegisterResult> => {
  const email = overrides.email || uniqueEmail();
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test User',
      email,
      password: 'password123',
      ...overrides,
    });
  return { res, token: res.body.token, user: res.body.user, email };
};
