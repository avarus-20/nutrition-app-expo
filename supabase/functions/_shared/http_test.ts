import { assertEquals } from 'jsr:@std/assert@1';

import { appLanguage, checkBase64, json, quotaLimit, quotaResponse } from './http.ts';

Deno.test('checkBase64 validates encoding and decoded size', () => {
  assertEquals(checkBase64('aGVsbG8=', 10), null);
  assertEquals(checkBase64('', 10), 'invalid_payload');
  assertEquals(checkBase64(42, 10), 'invalid_payload');
  assertEquals(checkBase64('abc', 10), 'invalid_payload');
  assertEquals(checkBase64('ab$=', 10), 'invalid_payload');
  assertEquals(checkBase64('A'.repeat(16), 6), 'payload_too_large');
});

Deno.test('appLanguage maps locales to app languages', () => {
  assertEquals(appLanguage('ru-RU'), 'ru');
  assertEquals(appLanguage('fi'), 'fi');
  assertEquals(appLanguage('de-DE'), 'en');
  assertEquals(appLanguage(undefined), 'en');
});

Deno.test('json responses carry CORS headers', async () => {
  const res = json(400, { error: 'invalid_payload' });
  assertEquals(res.status, 400);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(await res.json(), { error: 'invalid_payload' });
});

Deno.test('quota limits come from env with safe defaults', async () => {
  assertEquals(quotaLimit('transcribe', undefined), 60);
  assertEquals(quotaLimit('estimate-photo', '10'), 10);
  assertEquals(quotaLimit('estimate-photo', '-1'), 30);
  assertEquals(quotaLimit('estimate-photo', 'abc'), 30);
  const limited = quotaResponse('exceeded');
  assertEquals(limited.status, 429);
  assertEquals(limited.headers.get('Retry-After'), '3600');
  assertEquals(await limited.json(), { error: 'rate_limited' });
  assertEquals(quotaResponse('unavailable').status, 503);
});
