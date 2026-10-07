import { mapAuthError, validateCredentials } from '@/auth/authGateway';
import { claimLocalData, countLocalRecords } from '@/auth/claimLocalData';
import { goalId } from '@/services/bodyService';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

describe('auth error mapping', () => {
  it('maps Supabase errors to app error codes', () => {
    expect(mapAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' }).code).toBe(
      'auth_invalid_credentials',
    );
    expect(mapAuthError({ code: 'user_already_exists', message: 'x' }).code).toBe('auth_email_taken');
    expect(mapAuthError({ code: 'weak_password', message: 'x' }).code).toBe('auth_weak_password');
    expect(mapAuthError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }).code).toBe('network');
    expect(mapAuthError({ message: 'something else' }).code).toBe('auth');
  });

  it('validates credentials before calling the backend', () => {
    expect(validateCredentials('a@b.co', '12345678')).toEqual({});
    expect(validateCredentials('nope', '123')).toEqual({ email: 'invalid_email', password: 'too_short' });
  });
});

describe('claiming local data on sign-in', () => {
  const USER = '11111111-1111-4111-8111-111111111111';

  it('moves local records to the account and keeps them queued for sync', async () => {
    const db = await setupDb();
    const local = servicesFor(db, { id: 'local' });
    await local.meals.addItemsToDay({ date: '2024-05-01', mealType: 'lunch' }, [item()]);
    await local.weight.add({ measured_at: '2024-05-01T07:00:00.000Z', weight_kg: 70, notes: null });
    await local.goals.setGoal('calories', 2000);
    expect(await countLocalRecords(db)).toBe(4);

    await claimLocalData(db, USER);

    expect(await countLocalRecords(db)).toBe(0);
    const account = servicesFor(db, { id: USER });
    expect(await account.meals.getDay('2024-05-01')).toHaveLength(1);
    expect(await account.goals.getGoals()).toEqual({ calories: 2000 });
    const goal = await db.first<{ id: string }>('SELECT id FROM nutrition_goals');
    expect(goal?.id).toBe(await goalId(USER, 'calories'));
    const outbox = await db.all<{ entity: string; entity_id: string }>('SELECT entity, entity_id FROM sync_outbox');
    expect(outbox.find((o) => o.entity === 'nutrition_goals')?.entity_id).toBe(goal?.id);
    expect(outbox).toHaveLength(4);
  });

  it('keeps the newer goal when the account already has one', async () => {
    const db = await setupDb();
    const account = servicesFor(db, { id: USER });
    await account.goals.setGoal('calories', 1800);
    await new Promise((r) => setTimeout(r, 5));
    const local = servicesFor(db, { id: 'local' });
    await local.goals.setGoal('calories', 2200);
    await claimLocalData(db, USER);
    expect(await account.goals.getGoals()).toEqual({ calories: 2200 });
    expect(await db.all('SELECT * FROM nutrition_goals')).toHaveLength(1);
  });

  it('is a no-op without local data or for the local owner', async () => {
    const db = await setupDb();
    expect(await claimLocalData(db, USER)).toBe(0);
    expect(await claimLocalData(db, 'local')).toBe(0);
  });
});
