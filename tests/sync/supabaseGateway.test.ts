import { classifyRemoteError, SupabaseGateway } from '@/sync/supabaseGateway';

jest.mock('@/media/localFiles', () => ({
  readFileBytes: jest.fn(async () => new Uint8Array([1, 2, 3])),
}));

describe('classifyRemoteError', () => {
  it.each([
    [{ message: 'TypeError: Failed to fetch' }, 'network'],
    [{ message: 'Network request failed' }, 'network'],
    [{ message: 'Service Unavailable', status: 503 }, 'network'],
    [{ message: 'Too many requests', status: 429 }, 'network'],
    [{ message: 'JWT expired', code: 'PGRST301', status: 401 }, 'network'],
    [{ message: 'could not serialize access', code: '40001', status: 409 }, 'network'],
    [{ message: 'new row violates row-level security policy', code: '42501', status: 403 }, 'sync'],
    [{ message: 'violates check constraint', code: '23514', status: 400 }, 'sync'],
    [{ message: 'violates foreign key constraint', code: '23503', status: 409 }, 'sync'],
    [{ message: 'Bad request', status: 400 }, 'sync'],
  ])('%j -> %s', (error, code) => {
    expect(classifyRemoteError(error).code).toBe(code);
  });

  it('uses the upload code for rejected storage requests', () => {
    expect(classifyRemoteError({ message: 'Payload too large', statusCode: '413' }, 'upload').code).toBe('upload');
  });
});

function fakeClient() {
  const calls: { method: string; args: unknown[] }[] = [];
  const result = { data: [{ id: 'x' }], error: null, status: 200 };
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'gte', 'order', 'limit', 'upsert']) {
    builder[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const upload = jest.fn(async () => ({ data: {}, error: null }));
  const client = {
    from: (table: string) => {
      calls.push({ method: 'from', args: [table] });
      return builder;
    },
    storage: { from: () => ({ upload }) },
  };
  return { client, calls, upload };
}

describe('SupabaseGateway', () => {
  it('pulls with keyset pagination ordered by (server_updated_at, id)', async () => {
    const { client, calls } = fakeClient();
    const gateway = new SupabaseGateway(client as never, 'user-media');
    const rows = await gateway.pull('meals', 'u1', { ts: '2025-01-01T00:00:00.123456+00:00', id: 'abc' }, 50);
    expect(rows).toEqual([{ id: 'x' }]);
    expect(calls).toEqual([
      { method: 'from', args: ['meals'] },
      { method: 'select', args: ['*'] },
      { method: 'eq', args: ['user_id', 'u1'] },
      {
        method: 'or',
        args: [
          'server_updated_at.gt."2025-01-01T00:00:00.123456+00:00",and(server_updated_at.eq."2025-01-01T00:00:00.123456+00:00",id.gt."abc")',
        ],
      },
      { method: 'order', args: ['server_updated_at', { ascending: true }] },
      { method: 'order', args: ['id', { ascending: true }] },
      { method: 'limit', args: [50] },
    ]);
  });

  it('uses an inclusive lower bound for the overlap window start', async () => {
    const { client, calls } = fakeClient();
    await new SupabaseGateway(client as never, 'b').pull('meals', 'u1', { ts: '2025-01-01T00:00:00.000Z', id: '' }, 10);
    expect(calls.find((c) => c.method === 'gte')?.args).toEqual(['server_updated_at', '2025-01-01T00:00:00.000Z']);
    expect(calls.some((c) => c.method === 'or')).toBe(false);
  });

  it('upserts on the primary key and uploads files with overwrite', async () => {
    const { client, calls, upload } = fakeClient();
    const gateway = new SupabaseGateway(client as never, 'user-media');
    await gateway.upsert('meals', [{ id: '1' }]);
    expect(calls.find((c) => c.method === 'upsert')?.args).toEqual([[{ id: '1' }], { onConflict: 'id', ignoreDuplicates: false }]);
    await gateway.uploadFile('u1/photo/1.jpg', 'file:///x.jpg', 'image/jpeg');
    expect(upload).toHaveBeenCalledWith('u1/photo/1.jpg', expect.any(ArrayBuffer), { contentType: 'image/jpeg', upsert: true });
  });
});
