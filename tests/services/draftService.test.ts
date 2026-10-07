import { claimLocalData, wipeAccountData } from '@/auth/claimLocalData';
import { sanitizeDraftItems } from '@/domain/drafts';
import { item, servicesFor, setupDb } from '../helpers/fixtures';

const DAY = '2024-05-01';
const USER = '11111111-1111-4111-8111-111111111111';
let n = 0;
const key = () => `k${++n}`;

const recognized = [
  { food_name: 'Borscht', quantity: 300, unit: 'g', calories: 180, protein_g: 6, carbs_g: 20, fat_g: 8, confidence: 0.8 },
  { food_name: 'Rye bread', quantity: 1, unit: 'bowl', calories: 9999999, confidence: 3 },
  { food_name: '', quantity: 1 },
  { food_name: 'Mystery', quantity: -1 },
  'garbage',
];

describe('sanitizeDraftItems', () => {
  it('keeps usable items and neutralizes out-of-range values', () => {
    const items = sanitizeDraftItems(recognized, key);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ food_name: 'Borscht', unit: 'g', calories: 180, confidence: 0.8 });
    expect(items[1]).toMatchObject({ food_name: 'Rye bread', unit: 'serving', calories: null, confidence: null });
    expect(sanitizeDraftItems('nope', key)).toEqual([]);
    expect(sanitizeDraftItems(Array.from({ length: 50 }, () => recognized[0]), key)).toHaveLength(30);
  });
});

describe('DraftService', () => {
  it('creates a draft, requires confirmation and writes items with the draft source', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const id = await s.drafts.create({ source: 'photo_ai', target: { date: DAY, mealType: 'lunch' }, items: recognized });
    expect(await s.drafts.count()).toBe(1);
    expect(await s.meals.getDay(DAY)).toEqual([]); // nothing is logged before confirmation

    const draft = await s.drafts.get(id);
    expect(draft?.items.map((i) => i.food_name)).toEqual(['Borscht', 'Rye bread']);
    const mealId = await s.drafts.confirm(id, [item({ food_name: 'Borscht', calories: 180 })]);
    const day = await s.meals.getDay(DAY);
    expect(day).toHaveLength(1);
    expect(day[0]?.id).toBe(mealId);
    expect(day[0]?.items.map((i) => [i.food_name, i.source])).toEqual([['Borscht', 'photo_ai']]);
    expect(await s.drafts.get(id)).toBeNull();
  });

  it('refuses empty recognition results and invalid targets', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    await expect(s.drafts.create({ source: 'voice', target: { date: DAY, mealType: 'lunch' }, items: [] })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(
      s.drafts.create({ source: 'voice', target: { date: '2024-13-01', mealType: 'lunch' }, items: recognized }),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it("uses the draft's meal, falling back to the same type and day when that meal was deleted", async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const mealId = await s.meals.addItemsToDay({ date: DAY, mealType: 'dinner' }, [item()]);
    const d1 = await s.drafts.create({ source: 'photo_ai', target: { date: DAY, mealType: 'dinner', mealId }, items: recognized });
    expect(await s.drafts.confirm(d1, [item({ food_name: 'Soup' })])).toBe(mealId);

    const d2 = await s.drafts.create({ source: 'photo_ai', target: { date: DAY, mealType: 'dinner', mealId }, items: recognized });
    await s.meals.deleteMeal(mealId);
    const newMeal = await s.drafts.confirm(d2, [item({ food_name: 'Soup' })]);
    expect(newMeal).not.toBe(mealId);

    const d3 = await s.drafts.create({ source: 'voice', target: { date: DAY, mealType: 'dinner', mealId: newMeal }, items: recognized });
    const moved = await s.drafts.confirm(d3, [item()], { date: '2024-05-02', mealType: 'breakfast', mealId: newMeal });
    const meal = await s.meals.getMeal(moved);
    expect(meal).toMatchObject({ local_date: '2024-05-02', meal_type: 'breakfast' });
  });

  it('saves review edits and dismisses drafts', async () => {
    const db = await setupDb();
    const s = servicesFor(db);
    const id = await s.drafts.create({ source: 'voice', target: { date: DAY, mealType: 'snack' }, items: recognized, inputText: 'borscht' });
    const draft = await s.drafts.get(id);
    await s.drafts.saveItems(id, draft!.items.slice(0, 1));
    expect((await s.drafts.get(id))?.items).toHaveLength(1);
    expect((await s.drafts.get(id))?.input_text).toBe('borscht');
    await s.drafts.dismiss(id);
    expect(await s.drafts.list()).toEqual([]);
    await expect(s.drafts.saveItems(id, [])).rejects.toMatchObject({ code: 'not_found' });
  });

  it('moves drafts to the account at sign-in and deletes them with the account', async () => {
    const db = await setupDb();
    const owner = { id: 'local' };
    const s = servicesFor(db, owner);
    await s.drafts.create({ source: 'photo_ai', target: { date: DAY, mealType: 'lunch' }, items: recognized });
    await claimLocalData(db, USER);
    owner.id = USER;
    expect(await s.drafts.count()).toBe(1);
    await wipeAccountData(db, USER);
    expect(await s.drafts.count()).toBe(0);
  });
});
