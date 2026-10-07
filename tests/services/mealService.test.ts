import { dataEvents } from '@/services/events';
import { AppError } from '@/utils/errors';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

const DAY = '2024-05-01';

describe('MealService', () => {
  it('creates a meal with items and reads it back for the day', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    const id = await meals.createMeal(
      { local_date: DAY, eaten_at: '2024-05-01T07:00:00.000Z', meal_type: 'breakfast', title: 'Eggs', notes: null },
      [item(), item({ food_name: 'Toast', calories: 90, unit: 'slice', quantity: 2 })],
    );
    const day = await meals.getDay(DAY);
    expect(day).toHaveLength(1);
    expect(day[0]?.id).toBe(id);
    expect(day[0]?.items.map((i) => i.food_name)).toEqual(['Egg', 'Toast']);
  });

  it('adds items to an existing meal of the same type', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    const a = await meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    const b = await meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item({ food_name: 'Soup' })]);
    expect(a).toBe(b);
    const day = await meals.getDay(DAY);
    expect(day[0]?.items).toHaveLength(2);
  });

  it('rejects invalid items without writing anything', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    await expect(
      meals.addItemsToDay({ date: DAY, mealType: 'dinner' }, [item(), item({ calories: -5 })]),
    ).rejects.toMatchObject({ code: 'validation' });
    expect(await meals.getDay(DAY)).toEqual([]);
    expect(await db.all('SELECT * FROM sync_outbox')).toEqual([]);
  });

  it('edits past meals and items and enqueues them for sync', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    const mealId = await meals.addItemsToDay({ date: '2023-12-24', mealType: 'dinner' }, [item()]);
    const meal = await meals.getMeal(mealId);
    const itemId = meal!.items[0]!.id;
    await meals.updateMeal(mealId, { notes: 'Christmas', meal_type: 'lunch' });
    await meals.updateItem(itemId, item({ calories: 99, quantity: 3 }));
    const after = await meals.getMeal(mealId);
    expect(after?.notes).toBe('Christmas');
    expect(after?.meal_type).toBe('lunch');
    expect(after?.items[0]?.calories).toBe(99);
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(meal!.updated_at).getTime() - 1);
    const outbox = await db.all<{ entity: string; revision: number }>('SELECT entity, revision FROM sync_outbox ORDER BY entity');
    expect(outbox).toEqual([
      { entity: 'meal_items', revision: 2 },
      { entity: 'meals', revision: 2 },
    ]);
  });

  it('soft-deletes meals with their items', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    const mealId = await meals.addItemsToDay({ date: DAY, mealType: 'snack' }, [item(), item()]);
    await meals.deleteMeal(mealId);
    expect(await meals.getDay(DAY)).toEqual([]);
    const raw = await db.all<{ deleted_at: string | null }>('SELECT deleted_at FROM meal_items');
    expect(raw).toHaveLength(2);
    expect(raw.every((r) => r.deleted_at !== null)).toBe(true);
    await expect(meals.deleteMeal(mealId)).rejects.toBeInstanceOf(AppError);
  });

  it('isolates data by owner', async () => {
    const db = await setupDb();
    const owner = { id: 'user-a' };
    const { meals } = servicesFor(db, owner);
    const mealId = await meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    owner.id = 'user-b';
    expect(await meals.getDay(DAY)).toEqual([]);
    expect(await meals.getMeal(mealId)).toBeNull();
    await expect(meals.deleteMeal(mealId)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('aggregates daily totals in SQL', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    await meals.addItemsToDay({ date: '2024-05-01', mealType: 'lunch' }, [item({ calories: 100, protein_g: 10 }), item({ calories: 50, protein_g: null })]);
    await meals.addItemsToDay({ date: '2024-05-02', mealType: 'lunch' }, [item({ calories: 300, protein_g: 1.25 })]);
    const removed = await meals.addItemsToDay({ date: '2024-05-02', mealType: 'dinner' }, [item({ calories: 999 })]);
    await meals.deleteMeal(removed);
    const totals = await meals.dailyTotals('2024-05-01', '2024-05-31');
    expect(totals.map((t) => [t.date, t.calories, t.protein_g])).toEqual([
      ['2024-05-01', 150, 10],
      ['2024-05-02', 300, 1.3],
    ]);
    const days = await meals.daysWithData(10, 0);
    expect(days.map((d) => d.date)).toEqual(['2024-05-02', '2024-05-01']);
  });

  it('lists recent distinct items', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    await meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item({ food_name: 'Apple' })]);
    await meals.addItemsToDay({ date: DAY, mealType: 'dinner' }, [item({ food_name: 'apple' }), item({ food_name: 'Rice' })]);
    const recent = await meals.recentItems(10);
    expect(recent.map((r) => r.food_name.toLowerCase()).sort()).toEqual(['apple', 'rice']);
  });

  it('moves an item to another meal type on the same day, creating the meal', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    const lunchId = await meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item({ food_name: 'Soup' }), item()]);
    const soup = (await meals.getMeal(lunchId))!.items.find((i) => i.food_name === 'Soup')!;
    const dinnerId = await meals.moveItemToType(soup.id, 'dinner');
    expect(dinnerId).not.toBe(lunchId);
    const day = await meals.getDay(DAY);
    expect(day.map((m) => [m.meal_type, m.items.map((i) => i.food_name)])).toEqual([
      ['lunch', ['Egg']],
      ['dinner', ['Soup']],
    ]);
    expect(await meals.moveItemToType(soup.id, 'dinner')).toBe(dinnerId);
    await expect(meals.moveItemToType('missing', 'lunch')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('stores a per-item source in mixed batches', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    const id = await meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [
      { ...item({ food_name: 'A' }), source: 'recent' },
      item({ food_name: 'B' }),
    ]);
    const m = await meals.getMeal(id);
    expect(m!.items.map((i) => [i.food_name, i.source])).toEqual([
      ['A', 'recent'],
      ['B', 'manual'],
    ]);
  });

  it('emits change events', async () => {
    const db = await setupDb();
    const { meals } = servicesFor(db);
    const listener = jest.fn();
    const unsubscribe = dataEvents.subscribe(listener);
    await meals.addItemsToDay({ date: DAY, mealType: 'lunch' }, [item()]);
    unsubscribe();
    expect(listener).toHaveBeenCalledWith(['meals', 'meal_items']);
  });
});
