import bcrypt from 'bcryptjs';
import { query } from '../config/database';

interface TestUser {
  name: string;
  email: string;
  password: string;
}

const TEST_USERS: TestUser[] = [
  { name: 'Alice', email: 'alice@test.com', password: 'password123' },
  { name: 'Bob', email: 'bob@test.com', password: 'password123' },
];

export const seedTestUsers = async () => {
  for (const user of TEST_USERS) {
    try {
      const existing = await query('SELECT id FROM users WHERE email = $1', [
        user.email,
      ]);

      if (existing.rows.length > 0) {
        console.log(`Test user already exists: ${user.email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(user.password, 10);
      await query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)',
        [user.name, user.email, hashedPassword]
      );

      console.log(`Created test user: ${user.email} / ${user.password}`);
    } catch (error) {
      console.error(`Failed to create test user ${user.email}:`, error);
    }
  }
};
