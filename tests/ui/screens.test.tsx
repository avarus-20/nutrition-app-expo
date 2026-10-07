import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { BackupScreen } from '@/features/backup/BackupScreen';
import { DraftReviewScreen } from '@/features/drafts/DraftScreens';
import { GoalsScreen } from '@/features/goals/GoalsScreen';
import { pickTextFile, saveTextFile } from '@/media/fileTransfer';
import { renderWithApp, testServices } from '../helpers/renderApp';

jest.mock('@/database/client', () => ({ getDatabase: jest.fn() }));
jest.mock('@/backend/supabase', () => ({ getSupabase: () => null }));
jest.mock('@/media/fileTransfer', () => ({ saveTextFile: jest.fn(), pickTextFile: jest.fn() }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => ({}),
}));

const DAY = '2024-05-01';

describe('GoalsScreen', () => {
  it('validates input and saves goals', async () => {
    const services = await testServices();
    await renderWithApp(<GoalsScreen />, services);
    const calories = await screen.findByTestId('goal-calories');
    await fireEvent.changeText(calories, 'abc');
    await fireEvent.press(screen.getByTestId('goals-save'));
    expect(await screen.findByText('Enter a valid number')).toBeTruthy();
    expect((await services.goals.getGoals()).calories).toBeUndefined();

    await fireEvent.changeText(calories, '2100');
    await fireEvent.press(screen.getByTestId('goals-save'));
    await waitFor(async () => expect((await services.goals.getGoals()).calories).toBe(2100));
  });

  it('renders in Russian', async () => {
    const services = await testServices();
    await renderWithApp(<GoalsScreen />, services, { language: 'ru', theme: 'dark' });
    expect(await screen.findByText('Сохранить')).toBeTruthy();
  });
});

describe('DraftReviewScreen', () => {
  it('requires unknown calories before anything is logged', async () => {
    const services = await testServices();
    const id = await services.drafts.create({
      source: 'voice',
      target: { date: DAY, mealType: 'lunch' },
      items: [{ food_name: 'Soup', quantity: 300, unit: 'g', calories: null }],
    });
    await renderWithApp(<DraftReviewScreen id={id} />, services);
    const confirm = await screen.findByTestId('draft-confirm');
    await fireEvent.press(confirm);
    expect(await screen.findByText('Calories unknown — please enter them')).toBeTruthy();
    expect(await services.meals.getDay(DAY)).toEqual([]);

    await fireEvent.changeText(screen.getByTestId('draft-0-calories'), '210');
    await fireEvent.press(confirm);
    await waitFor(async () => {
      const [meal] = await services.meals.getDay(DAY);
      expect(meal?.items).toEqual([expect.objectContaining({ food_name: 'Soup', calories: 210, source: 'voice' })]);
    });
    expect(await services.drafts.count()).toBe(0);
  });
});

describe('BackupScreen', () => {
  it('exports a backup file and reports invalid restore files', async () => {
    const services = await testServices();
    await services.water.add({ consumed_at: '2024-05-01T08:00:00.000Z', local_date: DAY, amount_ml: 300 });
    await renderWithApp(<BackupScreen />, services);

    await fireEvent.press(await screen.findByRole('button', { name: 'Export backup (JSON)' }));
    expect(await screen.findByText('Export ready')).toBeTruthy();
    const [name, content, type] = jest.mocked(saveTextFile).mock.calls[0]!;
    expect(name).toMatch(/^nutrition-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(type).toBe('application/json');
    expect(JSON.parse(content).data.water_entries).toHaveLength(1);

    jest.mocked(pickTextFile).mockResolvedValueOnce('{"not":"a backup"}');
    await fireEvent.press(screen.getByRole('button', { name: 'Restore from backup' }));
    expect(await screen.findByText('This file is not a valid Nutrition Tracker backup.')).toBeTruthy();
  });
});
