import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import { useT } from "../../lib/i18n";
import { sumCalories } from "../../lib/logic";
import { listDays, loadMealsForDay } from "../../lib/storage";

export default function HistoryScreen() {
  const { t } = useT();
  const router = useRouter();
  const [items, setItems] = useState<{ date: string; total: number }[]>([]);

  useEffect(() => {
    (async () => {
      const days = await listDays();
      const rows: { date: string; total: number }[] = [];
      for (const d of days) {
        const meals = await loadMealsForDay(d);
        rows.push({ date: d, total: sumCalories(meals) });
      }
      setItems(rows);
    })();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 8 }}>
        {t.historyTitle}
      </Text>

      <FlatList
        data={items}
        keyExtractor={(it) => it.date}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/day/${item.date}`)}
            style={{
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 16 }}>{item.date}</Text>
            <Text style={{ fontWeight: "600" }}>{item.total} kcal</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={{ color: "#777" }}>{t.nothingYet}</Text>}
      />
    </SafeAreaView>
  );
}
