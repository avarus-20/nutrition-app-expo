import { parseDecimal } from '@/domain/validation';
import { formsToDraftItems, parseDraftForms, toDraftForm } from '@/features/drafts/draftForm';
import { en } from '@/i18n/en';

const m = en;
const draftItem = {
  key: 'a',
  food_name: 'Borscht',
  quantity: 300,
  unit: 'g' as const,
  calories: 180.5,
  protein_g: 6,
  carbs_g: null,
  fat_g: 8,
  confidence: 0.7,
};

describe('draft review form', () => {
  it('round-trips a recognized item through the form', () => {
    const form = toDraftForm(draftItem, (v) => String(v).replace('.', ','));
    expect(form).toMatchObject({ name: 'Borscht', quantity: '300', unit: 'g', confidence: 0.7 });
    expect(form.nutrition).toMatchObject({ calories: '180,5', protein_g: '6', carbs_g: '', fat_g: '8' });
    const parsed = parseDraftForms([form], m);
    expect(parsed.items).toEqual([
      {
        food_name: 'Borscht',
        food_id: null,
        quantity: 300,
        unit: 'g',
        calories: 180.5,
        protein_g: 6,
        carbs_g: null,
        fat_g: 8,
        fiber_g: null,
        sugar_g: null,
        salt_g: null,
      },
    ]);
  });

  it('requires calories and a valid amount before confirmation', () => {
    const missing = toDraftForm({ ...draftItem, calories: null }, String);
    const badQty = { ...toDraftForm({ ...draftItem, key: 'b' }, String), quantity: '0' };
    const parsed = parseDraftForms([missing, badQty], m);
    expect(parsed.items).toBeNull();
    expect(parsed.errors).toEqual({ a: { calories: m.common.required }, b: { quantity: m.common.outOfRange } });
  });

  it('keeps unparseable edits as unknown values when saving progress', () => {
    const form = { ...toDraftForm(draftItem, String), quantity: 'abc', nutrition: { ...toDraftForm(draftItem, String).nutrition, calories: 'x' } };
    const [saved] = formsToDraftItems([form], parseDecimal);
    expect(saved).toMatchObject({ quantity: 1, calories: null, fat_g: 8 });
  });
});
