import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

export default function DayScreen() {
  const { date } = useLocalSearchParams();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>День: {date}</Text>
    </View>
  );
}
