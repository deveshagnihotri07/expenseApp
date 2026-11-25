import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../src/app';
import { resetDatabase, closePool } from './helpers/testDb';
import { registerUser } from './helpers/factories';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const binaryParser = (res: any, callback: any) => {
  const data: Buffer[] = [];
  res.on('data', (chunk: Buffer) => data.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(data)));
  res.on('error', callback);
};

const download = async (url: string, token: string) => {
  return request(app)
    .get(url)
    .set(auth(token))
    .buffer(true)
    .parse(binaryParser);
};

const loadWorkbook = async (buffer: Buffer): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  return workbook;
};

const columnValues = (ws: ExcelJS.Worksheet, index: number): any[] =>
  (ws.getColumn(index).values as any[]).filter((v) => v !== undefined);

describe('Export API', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/export/excel');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid scope', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .get('/api/export/excel?scope=invalid')
      .set(auth(token));
    expect(res.status).toBe(400);
  });

  it('returns an xlsx workbook with all expected sheets', async () => {
    const { token, user } = await registerUser();

    await request(app)
      .post('/api/expenses')
      .set(auth(token))
      .send({
        description: 'Groceries',
        amount: 75,
        splits: [{ userId: user.id }],
      });

    const res = await download('/api/export/excel?scope=personal', token);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('.xlsx');

    const workbook = await loadWorkbook(res.body as Buffer);
    const names = workbook.worksheets.map((ws) => ws.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'Summary',
        'Expenses',
        'Splits',
        'Categories',
        'Monthly Trend',
        'Groups',
        'Friend Balances',
        'Settlements',
        'Raw Data',
      ])
    );

    const expensesSheet = workbook.getWorksheet('Expenses')!;
    expect(columnValues(expensesSheet, 2)).toContain('Groceries');
  });

  it('only exports data visible to the requesting user', async () => {
    const user1 = await registerUser();
    const user2 = await registerUser();

    await request(app)
      .post('/api/expenses')
      .set(auth(user1.token))
      .send({
        description: 'UserOneOnly',
        amount: 40,
        splits: [{ userId: user1.user.id }],
      });

    const res = await download('/api/export/excel?scope=both', user2.token);
    expect(res.status).toBe(200);

    const workbook = await loadWorkbook(res.body as Buffer);
    const expensesSheet = workbook.getWorksheet('Expenses')!;
    const descriptions = columnValues(expensesSheet, 2);

    expect(descriptions).not.toContain('UserOneOnly');
  });

  it('forbids exporting a group the user does not belong to', async () => {
    const owner = await registerUser();
    const outsider = await registerUser();

    const groupRes = await request(app)
      .post('/api/groups')
      .set(auth(owner.token))
      .send({ name: 'Private Group', memberIds: [] });

    const res = await request(app)
      .get(`/api/export/excel?scope=group&groupId=${groupRes.body.id}`)
      .set(auth(outsider.token));

    expect(res.status).toBe(403);
  });

  it('filters the export by month and year', async () => {
    const { token, user } = await registerUser();

    await request(app)
      .post('/api/expenses')
      .set(auth(token))
      .send({
        description: 'DatedExpense',
        amount: 20,
        expenseDate: '2020-03-15',
        splits: [{ userId: user.id }],
      });

    const res = await download(
      '/api/export/excel?scope=personal&month=3&year=2020',
      token
    );
    expect(res.status).toBe(200);

    const workbook = await loadWorkbook(res.body as Buffer);
    const descriptions = columnValues(workbook.getWorksheet('Expenses')!, 2);
    expect(descriptions).toContain('DatedExpense');

    const otherRes = await download(
      '/api/export/excel?scope=personal&month=4&year=2020',
      token
    );
    const otherWorkbook = await loadWorkbook(otherRes.body as Buffer);
    const otherDescriptions = columnValues(
      otherWorkbook.getWorksheet('Expenses')!,
      2
    );
    expect(otherDescriptions).not.toContain('DatedExpense');
  });
});
