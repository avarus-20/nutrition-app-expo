// FI: Aterian tietotyyppi (ruoka ja kalorit)
// RU: Тип данных "приём пищи" (название и калории)

export interface Meal {
  id: string;        // FI: satunnainen tunniste // RU: случайный ID
  title: string;     // FI: aterian nimi         // RU: название блюда
  calories: number;  // FI: kalorit              // RU: калории
  createdAt: string; // FI: ISO-päivä            // RU: ISO-дата (YYYY-MM-DD)
}
