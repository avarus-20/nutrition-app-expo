import { classifyFunctionError, SupabaseRecognition, unavailableRecognition } from '@/services/recognition';
import { bytesToBase64 } from '@/utils/base64';

const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: { status, json: async () => body },
});

describe('classifyFunctionError', () => {
  it.each([
    [{ name: 'FunctionsFetchError', message: 'Failed to send a request' }, 'network'],
    [{ name: 'FunctionsRelayError', message: 'relay' }, 'network'],
    [httpError(401, { error: 'unauthorized' }), 'auth'],
    [httpError(503, { error: 'not_configured' }), 'not_configured'],
    [httpError(413, { error: 'payload_too_large' }), 'validation'],
    [httpError(400, { error: 'unsupported_type' }), 'validation'],
    [httpError(429, {}), 'network'],
    [httpError(502, { error: 'provider_error' }), 'network'],
    [httpError(418, null), 'unknown'],
    [new Error('fetch failed'), 'network'],
  ])('%o -> %s', async (error, code) => {
    expect((await classifyFunctionError(error)).code).toBe(code);
  });

  it('tolerates a non-JSON error body', async () => {
    const e = { name: 'FunctionsHttpError', context: { status: 500, json: () => Promise.reject(new Error('no json')) } };
    expect((await classifyFunctionError(e)).code).toBe('network');
  });
});

describe('SupabaseRecognition', () => {
  const client = (response: { data: unknown; error: unknown }) => {
    const calls: { name: string; body: unknown }[] = [];
    return {
      calls,
      functions: {
        invoke: async (name: string, options: { body: unknown }) => {
          calls.push({ name, body: options.body });
          return response;
        },
      },
    };
  };

  it('calls estimate-photo and normalizes the response', async () => {
    const c = client({ data: { items: [{ food_name: 'Egg', quantity: 1 }], model: 'm1' }, error: null });
    const r = new SupabaseRecognition(c as never);
    const out = await r.estimatePhoto({ imageBase64: 'AAAA', mimeType: 'image/jpeg', locale: 'fi-FI' });
    expect(out).toEqual({ items: [{ food_name: 'Egg', quantity: 1 }], model: 'm1' });
    expect(c.calls[0]).toEqual({ name: 'estimate-photo', body: { imageBase64: 'AAAA', mimeType: 'image/jpeg', locale: 'fi-FI' } });

    const bad = new SupabaseRecognition(client({ data: { items: 'x' }, error: null }) as never);
    expect(await bad.estimatePhoto({ imageBase64: 'AAAA', mimeType: 'image/jpeg', locale: 'en' })).toEqual({ items: [], model: null });
  });

  it('maps function errors and rejects malformed transcripts', async () => {
    const failing = new SupabaseRecognition(client({ data: null, error: httpError(503, { error: 'not_configured' }) }) as never);
    await expect(failing.transcribe({ audioBase64: 'AAAA', mimeType: 'audio/mp4', locale: 'ru' })).rejects.toMatchObject({
      code: 'not_configured',
    });
    const malformed = new SupabaseRecognition(client({ data: { text: 42 }, error: null }) as never);
    await expect(malformed.transcribe({ audioBase64: 'AAAA', mimeType: 'audio/mp4', locale: 'ru' })).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('is unavailable without a backend session', async () => {
    await expect(unavailableRecognition.estimatePhoto({ imageBase64: '', mimeType: '', locale: '' })).rejects.toMatchObject({
      code: 'not_configured',
    });
  });
});

describe('bytesToBase64', () => {
  it('matches Node for every padding length and binary content', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 255, 1000]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) % 256);
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
    }
  });
});
