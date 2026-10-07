import * as Crypto from 'expo-crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function newId(): string {
  return Crypto.randomUUID();
}

/**
 * Name-based UUID (version 5 layout, SHA-1 of `namespace:name`).
 * Used where the same logical record must get the same id on every device
 * or on every run (legacy import, per-user singleton rows).
 */
export async function deterministicId(namespace: string, name: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA1,
    `${namespace}:${name}`,
  );
  const b = hex.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
