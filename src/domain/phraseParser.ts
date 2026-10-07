import type { Unit } from './types';

/**
 * Turns a spoken or typed sentence such as "2 eggs, a slice of bread 30 g and
 * coffee" (EN), "два яйца, хлеб 30 г и кофе" (RU) or "2 munaa, leipää 30 g ja
 * kahvi" (FI) into food phrases with amounts. Purely lexical and offline; the
 * result is a draft the user reviews.
 */
export interface ParsedPhrase {
  name: string;
  quantity: number;
  unit: Unit;
  /** True when the amount was stated (otherwise 1 serving was assumed). */
  explicit: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  // en
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, couple: 2, dozen: 12,
  // ru
  один: 1, одна: 1, одно: 1, одну: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7,
  восемь: 8, девять: 9, десять: 10, пол: 0.5, половина: 0.5, половину: 0.5, полторы: 1.5, полтора: 1.5,
  пара: 2, пару: 2,
  // fi
  yksi: 1, yhden: 1, kaksi: 2, kolme: 3, neljä: 4, viisi: 5, kuusi: 6, seitsemän: 7, kahdeksan: 8,
  yhdeksän: 9, kymmenen: 10, puoli: 0.5, puolikas: 0.5,
};

/** Unit words → (unit, multiplier into that unit). Longest forms first where prefixes overlap. */
const UNIT_WORDS: [RegExp, Unit, number][] = [
  [/^(kg|kilos?|kilograms?|кг|килограмм(а|ов)?|kilo[a]?|kilogramma[a]?)$/, 'g', 1000],
  [/^(g|gr|grams?|grammes?|г|гр|грамм(а|ов)?|gramma[a]?)$/, 'g', 1],
  [/^(l|liters?|litres?|л|литр(а|ов)?|litra[a]?)$/, 'ml', 1000],
  [/^(dl|desilitra[a]?|децилитр(а|ов)?)$/, 'ml', 100],
  [/^(ml|milliliters?|millilitres?|мл|миллилитр(а|ов)?|millilitra[a]?)$/, 'ml', 1],
  [/^(slices?|ломтик(а|ов)?|кус(ок|ка|ков)|кусочк(а|ов)|кусочек|viipale(tta)?|siivu[a]?|pala[a]?)$/, 'slice', 1],
  [/^(cups?|glass(es)?|mugs?|чашк[аиу]|чашек|стакан(а|ов)?|кружк[аиу]|кружек|kuppi|kupillinen|kupillista|kuppia|lasi|lasia|lasillinen|lasillista|muki|mukillinen)$/, 'cup', 1],
  [/^(tbsp|tablespoons?|ст\.?л\.?|ложк[аиу]|ложек|rkl|ruokalusikka|ruokalusikallista)$/, 'tbsp', 1],
  [/^(tsp|teaspoons?|ч\.?л\.?|tl|teelusikka|teelusikallista)$/, 'tsp', 1],
  [/^(pcs?|pieces?|шт\.?|штук[аи]?|kpl|kappale(tta)?)$/, 'piece', 1],
  [/^(servings?|portions?|порци[яийю]|порций|annos|annosta|annoksen)$/, 'serving', 1],
  [/^(bowls?|тарелк[аиу]|тарелок|миск[аиу]|kulho(llinen|llista)?|lautasellinen|lautasellista)$/, 'serving', 1],
];

const SEPARATORS = /\s*(?:[,;\n+]|\.\s|\s(?:and|plus|и|а также|плюс|ja|sekä)\s)\s*/i;
const LEADING_FILLER =
  /^(?:(?:i|we)\s+(?:had|ate|drank|have eaten)|for\s+(?:breakfast|lunch|dinner|a snack)|я\s+(?:съел[аи]?|выпил[аи]?|ел[аи]?)|съел[аи]?|выпил[аи]?|на\s+(?:завтрак|обед|ужин|перекус)|söin|join|aamiaiseksi|lounaaksi|päivälliseksi|välipalaksi|and|plus|и|ja|sekä)(?=[\s:,]|$)[\s:,]*/i;
const OF_WORDS = new Set(['of', 'из']);

function parseNumber(token: string): number | null {
  const t = token.toLowerCase();
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  if (/^\d+\/\d+$/.test(t)) {
    const [a, b] = t.split('/').map(Number);
    return b ? a! / b : null;
  }
  return NUMBER_WORDS[t] ?? null;
}

function parseUnit(token: string): [Unit, number] | null {
  const t = token.toLowerCase().replace(/[.:]$/, '');
  for (const [re, unit, factor] of UNIT_WORDS) if (re.test(t)) return [unit, factor];
  return null;
}

/** Splits "30g" / "250мл" into number + unit tokens. */
function tokenize(segment: string): string[] {
  return segment
    .replace(/(\d)([^\d\s.,/])/gu, '$1 $2')
    .split(/\s+/)
    .filter(Boolean);
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase() + s.slice(1);
}

function parseSegment(segment: string): ParsedPhrase | null {
  const tokens = tokenize(segment.replace(LEADING_FILLER, '').trim());
  if (tokens.length === 0) return null;

  let quantity: number | null = null;
  let unit: Unit | null = null;
  let factor = 1;
  const nameTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (quantity !== null) {
      // A second amount, e.g. "2 eggs 120 g": a weight/volume beats a count.
      const extra = parseNumber(tok);
      const extraUnit = extra !== null ? parseUnit(tokens[i + 1] ?? '') : null;
      if (extra !== null && extraUnit) {
        const measured = (u: Unit | null) => u === 'g' || u === 'ml';
        if (measured(extraUnit[0]) && !measured(unit)) {
          quantity = extra;
          [unit, factor] = extraUnit;
        }
        i++;
        continue;
      }
    }
    const n: number | null = quantity === null ? parseNumber(tok) : null;
    if (n !== null && n > 0) {
      // "a" / "an" only count as numbers before something; "half a cup" keeps 0.5.
      const next = tokens[i + 1];
      if ((tok === 'a' || tok === 'an') && !next) {
        nameTokens.push(tok);
        continue;
      }
      quantity = n;
      if (next && (next === 'a' || next === 'an') && n === 0.5) i++; // "half a ..."
      const u = next ? parseUnit(tokens[i + 1] ?? '') : null;
      if (u) {
        [unit, factor] = u;
        i++;
        if (OF_WORDS.has((tokens[i + 1] ?? '').toLowerCase())) i++;
      }
      continue;
    }
    if (quantity === null && unit === null) {
      const u = parseUnit(tok);
      if (u && nameTokens.length === 0 && i + 1 < tokens.length) {
        // "cup of tea", "ложка мёда": unit without a number means one.
        quantity = 1;
        [unit, factor] = u;
        if (OF_WORDS.has((tokens[i + 1] ?? '').toLowerCase())) i++;
        continue;
      }
    }
    nameTokens.push(tok);
  }

  const name = nameTokens
    .join(' ')
    .replace(/^(?:of|из)\s+/i, '')
    .replace(/[.!?…]+$/u, '')
    .trim();
  if (!name || /^\d+$/.test(name)) return null;
  const explicit = quantity !== null;
  return {
    name: capitalize(name.slice(0, 200)),
    quantity: Math.round((quantity ?? 1) * factor * 100) / 100,
    unit: unit ?? (explicit ? 'piece' : 'serving'),
    explicit,
  };
}

export function parseFoodPhrases(text: string): ParsedPhrase[] {
  return text
    .replace(/(\d),(\d)/g, '$1.$2')
    .split(SEPARATORS)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseSegment)
    .filter((p): p is ParsedPhrase => p !== null)
    .slice(0, 30);
}

/** Lowercased, accent/ё-insensitive key for matching phrases against saved foods. */
export function foodKey(name: string): string {
  return name
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
