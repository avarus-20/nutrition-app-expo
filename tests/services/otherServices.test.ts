import { goalId } from '@/services/bodyService';
import { servicesFor, setupDb } from '../helpers/fixtures';

const oats = {
  name: 'Овсянка',
  brand: null,
  barcode: '6414893400012',
  serving_size: 100,
  serving_unit: 'g' as const,
  calories: 370,
  protein_g: 13,
  carbs_g: 60,
  fat_g: 7,
  fiber_g: 10,
  sugar_g: 1,
  salt_g: 0,
};

describe('FoodService', () => {
  it('creates, searches (unicode, case-insensitive) and favorites foods', async () => {
    const db = await setupDb();
    const { foods } = servicesFor(db);
    const id = await foods.create(oats);
    await foods.create({ ...oats, name: 'Ruisleipä', barcode: null });
    expect((await foods.search('овся')).map((f) => f.id)).toEqual([id]);
    expect((await foods.search('RUIS')).map((f) => f.name)).toEqual(['Ruisleipä']);
    expect((await foods.search('6414893400012')).map((f) => f.id)).toEqual([id]);

    await foods.setFavorite(id, true);
    await foods.setFavorite(id, true);
    expect((await foods.favorites()).map((f) => f.id)).toEqual([id]);
    await foods.setFavorite(id, false);
    expect(await foods.favorites()).toEqual([]);
    await foods.setFavorite(id, true);
    const favRows = await db.all('SELECT * FROM favorite_foods');
    expect(favRows).toHaveLength(1);
  });

  it('soft-deletes a food together with its favorite', async () => {
    const db = await setupDb();
    const { foods } = servicesFor(db);
    const id = await foods.create(oats);
    await foods.setFavorite(id, true);
    await foods.remove(id);
    expect(await foods.search('')).toEqual([]);
    expect(await foods.favorites()).toEqual([]);
  });

  it('finds foods by barcode locally', async () => {
    const db = await setupDb();
    const { foods } = servicesFor(db);
    await foods.create(oats);
    expect(await foods.lookupBarcode('6414893400012')).toMatchObject({ name: 'Овсянка' });
    expect(await foods.lookupBarcode('000000')).toBeNull();
  });
});

describe('GoalService', () => {
  it('sets, updates and clears goals with deterministic ids', async () => {
    const db = await setupDb();
    const { goals } = servicesFor(db, { id: 'user-1' });
    await goals.setGoal('calories', 2000);
    await goals.setGoal('protein_g', 120);
    await goals.setGoal('calories', 1800);
    expect(await goals.getGoals()).toEqual({ calories: 1800, protein_g: 120 });
    await goals.setGoal('protein_g', null);
    expect(await goals.getGoals()).toEqual({ calories: 1800 });
    await goals.setGoal('protein_g', 90);
    expect(await goals.getGoals()).toEqual({ calories: 1800, protein_g: 90 });
    const rows = await db.all<{ id: string; nutrient: string }>('SELECT id, nutrient FROM nutrition_goals ORDER BY nutrient');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe(await goalId('user-1', 'calories'));
    await expect(goals.setGoal('calories', -1)).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('Weight and water', () => {
  it('records, edits and deletes weight entries', async () => {
    const db = await setupDb();
    const { weight } = servicesFor(db);
    const id = await weight.add({ measured_at: '2024-05-01T07:00:00.000Z', weight_kg: 80.5, notes: null });
    await weight.add({ measured_at: '2024-05-08T07:00:00.000Z', weight_kg: 79.9, notes: 'morning' });
    await weight.update(id, { measured_at: '2024-05-01T07:00:00.000Z', weight_kg: 80.2, notes: null });
    const list = await weight.list();
    expect(list.map((w) => w.weight_kg)).toEqual([79.9, 80.2]);
    await weight.remove(id);
    expect(await weight.list()).toHaveLength(1);
    await expect(weight.add({ measured_at: '2024-05-01T07:00:00.000Z', weight_kg: 0, notes: null })).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('records water and totals it per day', async () => {
    const db = await setupDb();
    const { water } = servicesFor(db);
    await water.add({ consumed_at: '2024-05-01T07:00:00.000Z', local_date: '2024-05-01', amount_ml: 250 });
    const id = await water.add({ consumed_at: '2024-05-01T09:00:00.000Z', local_date: '2024-05-01', amount_ml: 500 });
    expect(await water.dailyTotals('2024-05-01', '2024-05-01')).toEqual([{ date: '2024-05-01', amount_ml: 750 }]);
    await water.remove(id);
    expect((await water.forDay('2024-05-01')).map((w) => w.amount_ml)).toEqual([250]);
  });
});
