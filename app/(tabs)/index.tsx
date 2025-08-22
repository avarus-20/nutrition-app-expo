import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, View, Text, TextInput, Button, FlatList, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import uuid from 'react-native-uuid';
import type { Meal } from '../../types/meal';
import { loadMealsForDay, saveMealsForDay } from '../../lib/storage';
import { sumCalories, todayISO } from '../../lib/logic';

export default function TodayScreen() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [title, setTitle] = useState('');
  const [cal, setCal] = useState('');

  const iso = useMemo(() => todayISO(), []);
  const total = useMemo(() => sumCalories(meals), [meals]);

  useEffect(() => {
    loadMealsForDay(iso).then(setMeals).catch(console.error);
  }, [iso]);

  const addMeal = async () => {
    const c = Number(cal);
    if (!title.trim() || !Number.isFinite(c) || c <= 0) {
      Alert.alert('Проверьте данные', 'Название и положительные калории обязательны.');
      return;
    }
    const item: Meal = { id: String(uuid.v4()), title: title.trim(), calories: Math.round(c), createdAt: iso };
    const next = [item, ...meals];
    setMeals(next);
    await saveMealsForDay(iso, next);
    setTitle(''); setCal('');
  };

  const removeMeal = async (id: string) => {
    const next = meals.filter(m => m.id !== id);
    setMeals(next);
    await saveMealsForDay(iso, next);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1, padding: 16, gap: 12 }} behavior={Platform.select({ ios: 'padding', android: undefined })}>
        <Text style={{ fontSize: 22, fontWeight: '600' }}>Сегодня ({iso}) — всего: {total} ккал</Text>
        <TextInput placeholder="Блюдо" value={title} onChangeText={setTitle} style={{ borderWidth: 1, borderRadius: 10, padding: 10 }} />
        <TextInput placeholder="Калории" keyboardType="numeric" value={cal} onChangeText={setCal} style={{ borderWidth: 1, borderRadius: 10, padding: 10 }} />
        <Button title="Добавить" onPress={addMeal} />
        <View style={{ height: 12 }} />
        <FlatList
          data={meals}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={{ borderWidth: 1, borderRadius: 10, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>{item.title}</Text>
                <Text style={{ color: '#555' }}>{item.calories} ккал</Text>
              </View>
              <Button title="Удалить" color="#b00020" onPress={() => removeMeal(item.id)} />
            </View>
          )}
          ListEmptyComponent={<Text style={{ color: '#777' }}>Пока пусто. Добавьте первый приём пищи 👇</Text>}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
