import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';

const ROOT = join(__dirname, '..');
export const BASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/postgres';

export function migrationFiles(): string[] {
  const dir = join(ROOT, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));
}

/** Creates a throwaway database with the Supabase shim and all migrations applied. */
export async function createMigratedDatabase(): Promise<{ client: Client; drop: () => Promise<void> }> {
  const name = `nt_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = new Client({ connectionString: BASE_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(BASE_URL);
  url.pathname = `/${name}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(readFileSync(join(ROOT, 'supabase', 'tests', 'supabase_shim.sql'), 'utf8'));
  for (const file of migrationFiles()) await client.query(readFileSync(file, 'utf8'));

  return {
    client,
    drop: async () => {
      await client.end();
      const a = new Client({ connectionString: BASE_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}

export async function createUser(client: Client, email: string): Promise<string> {
  const r = await client.query<{ id: string }>('INSERT INTO auth.users (email) VALUES ($1) RETURNING id', [email]);
  return r.rows[0]!.id;
}

/** Runs `fn` as an authenticated API user (role + JWT claims), rolled back afterwards. */
export async function asUser<T>(client: Client, userId: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${userId ? 'authenticated' : 'anon'}`);
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
    ]);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
  }
}

/** Same as asUser but commits. */
export async function asUserCommit<T>(client: Client, userId: string, fn: (c: Client) => Promise<T>): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE authenticated');
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export function mealRow(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    user_id: userId,
    eaten_at: '2024-05-01T08:00:00Z',
    local_date: '2024-05-01',
    meal_type: 'breakfast',
    title: 'Porridge',
    notes: null,
    created_at: '2024-05-01T08:00:00Z',
    updated_at: '2024-05-01T08:00:00Z',
    ...overrides,
  };
}

export async function insertRow(c: Client, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  return c.query(
    `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    cols.map((k) => row[k]),
  );
}

/** PostgREST-style upsert (INSERT ... ON CONFLICT (id) DO UPDATE). */
export async function upsertRow(c: Client, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  return c.query(
    `INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${cols.filter((k) => k !== 'id').map((k) => `${k} = EXCLUDED.${k}`).join(', ')}
     RETURNING *`,
    cols.map((k) => row[k]),
  );
}
