/**
 * Date helpers. A "local date" is a calendar day in the user's timezone,
 * formatted `YYYY-MM-DD`. It is stored alongside timestamps so that day
 * grouping does not depend on the timezone of whoever reads the data.
 */

export type LocalDate = string;

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(date: Date): LocalDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayLocalDate(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

export function isValidLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** Parses a local date into a Date at local midnight. Throws on invalid input. */
export function parseLocalDate(value: LocalDate): Date {
  if (!isValidLocalDate(value)) throw new RangeError(`Invalid local date: ${value}`);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function addDays(value: LocalDate, days: number): LocalDate {
  const d = parseLocalDate(value);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

export function addMonths(value: LocalDate, months: number): LocalDate {
  const d = parseLocalDate(value);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toLocalDate(d);
}

export function startOfMonth(value: LocalDate): LocalDate {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: LocalDate): LocalDate {
  const d = parseLocalDate(startOfMonth(value));
  return toLocalDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Monday-based start of week. */
export function startOfWeek(value: LocalDate): LocalDate {
  const d = parseLocalDate(value);
  const offset = (d.getDay() + 6) % 7;
  return addDays(value, -offset);
}

/** Inclusive number of days between two local dates. */
export function daysBetweenInclusive(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000) + 1;
}

export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const n = daysBetweenInclusive(from, to);
  const out: LocalDate[] = [];
  for (let i = 0; i < n; i += 1) out.push(addDays(from, i));
  return out;
}

/** Calendar grid for a month: weeks (Mon..Sun) with `null` for padding cells. */
export function monthGrid(value: LocalDate): (LocalDate | null)[][] {
  const first = startOfMonth(value);
  const last = endOfMonth(value);
  const lead = (parseLocalDate(first).getDay() + 6) % 7;
  const cells: (LocalDate | null)[] = Array.from({ length: lead }, () => null);
  for (const day of eachDay(first, last)) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (LocalDate | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Combines a local date and a local time (HH:mm) into an ISO UTC timestamp. */
export function localDateTimeToIso(date: LocalDate, time: string): string {
  const d = parseLocalDate(date);
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.toISOString();
}

export function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Normalizes any timestamp string accepted by Date into canonical ISO UTC. */
export function normalizeIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid timestamp: ${value}`);
  return d.toISOString();
}

export function compareIso(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}
