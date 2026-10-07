import { AppError } from '@/utils/errors';
import { createTestDatabase } from '../helpers/nodeDriver';

describe('SerialDatabase', () => {
  it('rolls back failed transactions', async () => {
    const db = createTestDatabase();
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    await expect(
      db.transaction(async (tx) => {
        await tx.run('INSERT INTO t (v) VALUES (?)', ['a']);
        await tx.run('INSERT INTO t (v) VALUES (?)', [null]);
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await db.all('SELECT * FROM t')).toEqual([]);
  });

  it('does not interleave outside statements into an open transaction', async () => {
    const db = createTestDatabase();
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const txPromise = db
      .transaction(async (tx) => {
        await tx.run('INSERT INTO t (v) VALUES (?)', ['in-tx']);
        await gate;
        throw new Error('abort');
      })
      .catch(() => undefined);
    const outside = db.run('INSERT INTO t (v) VALUES (?)', ['outside']);
    release();
    await txPromise;
    await outside;
    const rows = await db.all<{ v: string }>('SELECT v FROM t');
    expect(rows.map((r) => r.v)).toEqual(['outside']);
  });

  it('commits successful transactions and returns the result', async () => {
    const db = createTestDatabase();
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    const n = await db.transaction(async (tx) => {
      await tx.run('INSERT INTO t (v) VALUES (?)', ['x']);
      return (await tx.first<{ n: number }>('SELECT COUNT(*) AS n FROM t'))?.n;
    });
    expect(n).toBe(1);
  });
});
