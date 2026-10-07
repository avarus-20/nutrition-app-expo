import { dayKey, sumCalories } from '../src/lib/logic';

describe('legacy logic', () => {
  it('sums calories ignoring non-finite values', () => {
    expect(
      sumCalories([
        { id: '1', title: 'a', calories: 100, createdAt: '2024-01-01' },
        { id: '2', title: 'b', calories: Number.NaN, createdAt: '2024-01-01' },
      ]),
    ).toBe(100);
  });

  it('builds legacy day keys', () => {
    expect(dayKey('2024-01-31')).toBe('meals_2024-01-31');
  });
});
