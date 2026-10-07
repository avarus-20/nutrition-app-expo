import type { EntityName } from '@/database/schema';
import type { DeviceInfo, PullCursor, RemoteGateway, RemoteRow } from '@/sync/remoteGateway';
import { AppError } from '@/utils/errors';

type FailureKind = 'network' | 'reject' | 'lost-response';

/**
 * In-memory server emulating the PostgreSQL behavior that matters for sync:
 * tg_sync_row (LWW, version, server clock with microseconds), RLS by user,
 * composite ownership foreign keys and keyset pagination.
 */
export class FakeRemote implements RemoteGateway {
  readonly tables = new Map<EntityName, Map<string, RemoteRow>>();
  readonly files = new Map<string, string>();
  readonly devices = new Map<string, DeviceInfo>();
  authUser: string | null = null;
  upsertCalls = 0;
  private clock = Date.parse('2025-01-01T00:00:00Z') * 1000; // microseconds
  private failures: FailureKind[] = [];
  private uploadFailures: FailureKind[] = [];
  rejectIds = new Set<string>();
  /** When set, every row gets the same server timestamp (pagination edge case). */
  frozenClock = false;

  table(entity: EntityName): Map<string, RemoteRow> {
    let t = this.tables.get(entity);
    if (!t) {
      t = new Map();
      this.tables.set(entity, t);
    }
    return t;
  }

  failNext(...kinds: FailureKind[]) {
    this.failures.push(...kinds);
  }

  failNextUpload(...kinds: FailureKind[]) {
    this.uploadFailures.push(...kinds);
  }

  private tick(): string {
    if (!this.frozenClock) this.clock += 1;
    const ms = Math.floor(this.clock / 1000);
    const micros = String(this.clock % 1000).padStart(3, '0');
    return new Date(ms).toISOString().replace('Z', `${micros}+00:00`);
  }

  /** Direct server-side write (another device / admin), bypassing checks. */
  put(entity: EntityName, row: RemoteRow) {
    this.table(entity).set(String(row.id), { version: 1, ...row, server_updated_at: this.tick() });
  }

  private checkFk(entity: EntityName, row: RemoteRow) {
    const parent = (e: EntityName, id: unknown) => {
      if (id === null || id === undefined) return;
      const p = this.table(e).get(String(id));
      if (!p || p.user_id !== row.user_id) throw new AppError('sync', 'violates foreign key constraint');
    };
    if (entity === 'meal_items') {
      parent('meals', row.meal_id);
      parent('foods', row.food_id);
    }
    if (entity === 'media_files' || entity === 'voice_notes') parent('meals', row.meal_id);
    if (entity === 'favorite_foods') parent('foods', row.food_id);
    if ((entity === 'media_files' || entity === 'voice_notes') && !String(row.storage_path ?? '').startsWith(`${String(row.user_id)}/`)) {
      throw new AppError('sync', 'violates check constraint storage_path');
    }
  }

  async upsert(entity: EntityName, rows: RemoteRow[]): Promise<void> {
    this.upsertCalls += 1;
    const failure = this.failures.shift();
    if (failure === 'network') throw new AppError('network', 'Failed to fetch');
    if (failure === 'reject') throw new AppError('sync', 'rejected');
    // All-or-nothing like a single SQL statement.
    const staged = new Map(this.table(entity));
    for (const row of rows) {
      if (row.user_id !== this.authUser) throw new AppError('sync', 'new row violates row-level security policy');
      if (this.rejectIds.has(String(row.id))) throw new AppError('sync', 'violates check constraint');
      this.checkFk(entity, row);
      const old = staged.get(String(row.id));
      if (!old) {
        staged.set(String(row.id), { ...row, version: 1, server_updated_at: this.tick() });
        continue;
      }
      if (old.user_id !== row.user_id) throw new AppError('sync', 'row-level security');
      if (Date.parse(String(row.updated_at)) <= Date.parse(String(old.updated_at))) continue;
      staged.set(String(row.id), {
        ...row,
        created_at: old.created_at,
        version: Number(old.version) + 1,
        server_updated_at: this.tick(),
      });
    }
    this.tables.set(entity, staged);
    if (failure === 'lost-response') throw new AppError('network', 'response lost');
  }

  async pull(entity: EntityName, userId: string, after: PullCursor | null, limit: number): Promise<RemoteRow[]> {
    const failure = this.failures.shift();
    if (failure === 'network') throw new AppError('network', 'Failed to fetch');
    if (failure) this.failures.unshift(failure);
    const key = (r: RemoteRow) => String(r.server_updated_at);
    // Lexicographic compare works for same-format timestamps; parse when formats differ.
    const cmpTs = (a: string, b: string) => {
      const pa = toMicros(a);
      const pb = toMicros(b);
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    };
    return [...this.table(entity).values()]
      .filter((r) => r.user_id === userId)
      .filter((r) => {
        if (!after) return true;
        const c = cmpTs(key(r), after.ts);
        return c > 0 || (c === 0 && String(r.id) > after.id);
      })
      .sort((a, b) => cmpTs(key(a), key(b)) || (String(a.id) < String(b.id) ? -1 : 1))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async uploadFile(path: string, localUri: string): Promise<void> {
    const failure = this.uploadFailures.shift();
    if (failure === 'network') throw new AppError('network', 'Failed to fetch');
    if (failure === 'reject') throw new AppError('upload', 'Payload too large');
    if (!path.startsWith(`${this.authUser}/`)) throw new AppError('upload', 'row-level security');
    this.files.set(path, localUri);
  }

  async downloadFile(path: string): Promise<Uint8Array> {
    if (!path.startsWith(`${this.authUser}/`)) throw new AppError('sync', 'row-level security');
    const content = this.files.get(path);
    if (content === undefined) throw new AppError('not_found', 'Object not found');
    return new TextEncoder().encode(content);
  }

  async registerDevice(device: DeviceInfo): Promise<void> {
    this.devices.set(device.id, device);
  }
}

function toMicros(ts: string): number {
  const m = /\.(\d+)/.exec(ts);
  const frac = m ? m[1]!.padEnd(6, '0').slice(0, 6) : '000000';
  const base = Date.parse(ts.replace(/\.\d+/, ''));
  return base * 1000 + Number(frac);
}
