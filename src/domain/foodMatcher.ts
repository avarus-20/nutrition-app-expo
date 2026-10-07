import type { DraftItemInput } from './drafts';
import { foodKey, type ParsedPhrase } from './phraseParser';
import type { Nutrition, Unit } from './types';

/** Something the user logged or saved before, with nutrition for `quantity` `unit`. */
export interface FoodCandidate extends Nutrition {
  name: string;
  quantity: number;
  unit: Unit;
}

const MIN_KEY = 3;

function score(phrase: string, candidate: string): number {
  if (phrase === candidate) return 3;
  if (candidate.length >= MIN_KEY && phrase.startsWith(candidate)) return 2; // "eggs" ~ "egg", "яйца" ~ "яйц"
  if (phrase.length >= MIN_KEY && candidate.startsWith(phrase)) return 2;
  // Shared stem for inflected languages: "молока" ~ "молоко", "kahvia" ~ "kahvi".
  const stem = Math.min(phrase.length, candidate.length) - 1;
  if (stem >= 4 && phrase.slice(0, stem) === candidate.slice(0, stem)) return 1;
  return 0;
}

function bestMatch(name: string, candidates: FoodCandidate[]): FoodCandidate | null {
  const key = foodKey(name);
  let best: FoodCandidate | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const s = score(key, foodKey(c.name));
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

const round = (v: number | null, f: number, digits = 1) => (v === null ? null : Math.round(v * f * 10 ** digits) / 10 ** digits);

/**
 * Builds draft items from parsed phrases. Nutrition comes from the best
 * matching saved food or recent entry, scaled to the stated amount when the
 * units agree; otherwise it stays unknown and the user enters it in review.
 * Earlier candidates win ties (pass saved foods before recent entries).
 */
export function phrasesToDraftItems(phrases: ParsedPhrase[], candidates: FoodCandidate[]): DraftItemInput[] {
  return phrases.map((p) => {
    const match = bestMatch(p.name, candidates);
    const unknown: DraftItemInput = {
      food_name: p.name,
      quantity: p.quantity,
      unit: p.unit,
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      confidence: null,
    };
    if (!match) return unknown;
    if (!p.explicit) {
      return { ...unknown, food_name: match.name, quantity: match.quantity, unit: match.unit, ...nutritionOf(match, 1) };
    }
    const sameUnit = p.unit === match.unit || (p.unit === 'piece' && match.unit === 'serving') || (p.unit === 'serving' && match.unit === 'piece');
    if (!sameUnit || match.quantity <= 0) return { ...unknown, food_name: match.name };
    return { ...unknown, food_name: match.name, ...nutritionOf(match, p.quantity / match.quantity) };
  });
}

function nutritionOf(c: FoodCandidate, f: number) {
  return {
    calories: Math.round(c.calories * f),
    protein_g: round(c.protein_g, f),
    carbs_g: round(c.carbs_g, f),
    fat_g: round(c.fat_g, f),
  };
}
