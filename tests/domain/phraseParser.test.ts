import { phrasesToDraftItems, type FoodCandidate } from '@/domain/foodMatcher';
import { foodKey, parseFoodPhrases } from '@/domain/phraseParser';

const simple = (text: string) => parseFoodPhrases(text).map((p) => [p.name, p.quantity, p.unit]);

describe('parseFoodPhrases', () => {
  it('parses English sentences', () => {
    expect(simple('I ate 2 eggs, a slice of bread 30 g and coffee')).toEqual([
      ['Eggs', 2, 'piece'],
      ['Bread', 30, 'g'],
      ['Coffee', 1, 'serving'],
    ]);
    expect(simple('200g chicken breast; half a cup of rice + 1.5 l water')).toEqual([
      ['Chicken breast', 200, 'g'],
      ['Rice', 0.5, 'cup'],
      ['Water', 1500, 'ml'],
    ]);
    expect(simple('two bananas plus a cup of tea')).toEqual([
      ['Bananas', 2, 'piece'],
      ['Tea', 1, 'cup'],
    ]);
    expect(simple('coffee with milk')).toEqual([['Coffee with milk', 1, 'serving']]);
  });

  it('parses Russian sentences, including decimal commas', () => {
    expect(simple('Я съел два яйца, хлеб 30 г и кофе')).toEqual([
      ['Яйца', 2, 'piece'],
      ['Хлеб', 30, 'g'],
      ['Кофе', 1, 'serving'],
    ]);
    expect(simple('на обед 1,5 кг арбуза, 250мл молока, стакан сока, 2 ломтика сыра')).toEqual([
      ['Арбуза', 1500, 'g'],
      ['Молока', 250, 'ml'],
      ['Сока', 1, 'cup'],
      ['Сыра', 2, 'slice'],
    ]);
  });

  it('parses Finnish sentences', () => {
    expect(simple('Söin kaksi munaa, ruisleipää 40 g ja kahvi')).toEqual([
      ['Munaa', 2, 'piece'],
      ['Ruisleipää', 40, 'g'],
      ['Kahvi', 1, 'serving'],
    ]);
    expect(simple('2 dl jogurttia, lasi maitoa, 3 kpl karjalanpiirakka')).toEqual([
      ['Jogurttia', 200, 'ml'],
      ['Maitoa', 1, 'cup'],
      ['Karjalanpiirakka', 3, 'piece'],
    ]);
  });

  it('prefers a stated weight over a count and ignores noise', () => {
    expect(simple('2 eggs 120 g')).toEqual([['Eggs', 120, 'g']]);
    expect(simple(' , and 42, ...')).toEqual([]);
    expect(parseFoodPhrases('egg')[0]).toMatchObject({ explicit: false });
    expect(parseFoodPhrases(Array.from({ length: 40 }, (_, i) => `food${i}`).join(', '))).toHaveLength(30);
  });
});

describe('phrasesToDraftItems', () => {
  const candidates: FoodCandidate[] = [
    { name: 'Egg', quantity: 1, unit: 'piece', calories: 70, protein_g: 6, carbs_g: 0.5, fat_g: 5, fiber_g: null, sugar_g: null, salt_g: null },
    { name: 'Ruisleipä', quantity: 100, unit: 'g', calories: 220, protein_g: 7, carbs_g: 40, fat_g: 2, fiber_g: 12, sugar_g: 1, salt_g: 1 },
    { name: 'Молоко', quantity: 200, unit: 'ml', calories: 100, protein_g: 6, carbs_g: 9.6, fat_g: 5, fiber_g: null, sugar_g: null, salt_g: null },
    { name: 'Coffee', quantity: 1, unit: 'cup', calories: 2, protein_g: null, carbs_g: null, fat_g: null, fiber_g: null, sugar_g: null, salt_g: null },
  ];

  it('fills nutrition from matching foods and scales it', () => {
    const items = phrasesToDraftItems(parseFoodPhrases('2 eggs, ruisleipää 40 g, 250 мл молока, coffee, mystery stew 300 g'), candidates);
    expect(items.map((i) => [i.food_name, i.quantity, i.unit, i.calories])).toEqual([
      ['Egg', 2, 'piece', 140],
      ['Ruisleipä', 40, 'g', 88],
      ['Молоко', 250, 'ml', 125],
      ['Coffee', 1, 'cup', 2],
      ['Mystery stew', 300, 'g', null],
    ]);
    expect(items[0]?.protein_g).toBe(12);
  });

  it('keeps nutrition unknown when units cannot be converted', () => {
    const [item] = phrasesToDraftItems(parseFoodPhrases('2 cups of milk'), [{ ...candidates[2]!, name: 'Milk' }]);
    expect(item).toMatchObject({ food_name: 'Milk', quantity: 2, unit: 'cup', calories: null });
  });

  it('normalizes keys', () => {
    expect(foodKey('  Ёжик-в-тумане!! ')).toBe('ежик в тумане');
    expect(foodKey('Crème brûlée')).toBe('creme brulee');
  });
});
