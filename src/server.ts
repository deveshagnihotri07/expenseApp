import dotenv from 'dotenv';
import http from 'http';
import app from './app';
import pool from './config/database';
import { seedTestUsers } from './utils/seedTestUsers';
import { startKeepAlive } from './utils/keepAlive';
import fs from 'fs';
import path from 'path';

dotenv.config();

const PORT = parseInt(process.env.PORT || '5000', 10);

const runSchema = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const fallbackPath = path.join(__dirname, '..', 'src', 'schema.sql');
  const resolved =
    fs.existsSync(schemaPath)
      ? schemaPath
      : fs.existsSync(fallbackPath)
      ? fallbackPath
      : null;

  if (!resolved) {
    console.warn('schema.sql not found, skipping schema init');
    return;
  }

  const schema = fs.readFileSync(resolved, 'utf8');
  try {
    await pool.query(schema);
    console.log('Database schema initialized');
  } catch (error) {
    console.error('Schema setup error:', error);
  }
};

const startServer = async () => {
  await runSchema();
  await seedTestUsers();

  const server = http.createServer(app);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Accessible at http://<your-ip>:${PORT}/api`);
    startKeepAlive();
  });
};

startServer();
