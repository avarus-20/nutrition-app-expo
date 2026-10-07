export type CsvValue = string | number | null | undefined;

/** RFC 4180 field escaping; also neutralizes spreadsheet formula injection. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
  if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds CSV with CRLF line endings and a UTF-8 BOM so Excel detects the encoding. */
export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvField).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
