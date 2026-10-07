// Speech-to-text for meal voice notes.
//
// The provider key (AI_API_KEY) is an Edge Function secret and never reaches
// the client. Audio is processed in memory and not stored or logged. The
// transcript is shown to the user, who edits it and turns it into draft
// entries that must be confirmed.
//
// Secrets / env:
//   AI_API_KEY     required, OpenAI-compatible API key
//   AI_BASE_URL    optional, default https://api.openai.com/v1
//   AI_STT_MODEL   optional, default whisper-1
import { appLanguage, checkBase64, cors, json, requireUser } from '../_shared/http.ts';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};
const PROMPTS = {
  en: 'A person lists the food and drinks of a meal with amounts, e.g. "two eggs, 30 g of bread and a coffee".',
  ru: 'Человек перечисляет еду и напитки с количеством, например: «два яйца, 30 грамм хлеба и кофе».',
  fi: 'Henkilö luettelee aterian ruoat ja juomat määrineen, esimerkiksi "kaksi munaa, 30 grammaa leipää ja kahvi".',
} as const;

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const userId = await requireUser(req);
  if (!userId) return json(401, { error: 'unauthorized' });

  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) return json(503, { error: 'not_configured' });

  let body: { audioBase64?: unknown; mimeType?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  const ext = typeof body.mimeType === 'string' ? TYPES[body.mimeType] : undefined;
  if (!ext) return json(400, { error: 'unsupported_type' });
  const payloadError = checkBase64(body.audioBase64, MAX_AUDIO_BYTES);
  if (payloadError) return json(payloadError === 'payload_too_large' ? 413 : 400, { error: payloadError });

  const language = appLanguage(body.locale);
  const form = new FormData();
  form.append('file', new Blob([decodeBase64(body.audioBase64 as string)], { type: body.mimeType as string }), `note.${ext}`);
  form.append('model', Deno.env.get('AI_STT_MODEL') ?? 'whisper-1');
  form.append('language', language);
  form.append('prompt', PROMPTS[language]);
  form.append('response_format', 'json');

  const baseUrl = (Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return json(502, { error: 'provider_unreachable' });
  }
  if (!response.ok) {
    console.error('transcribe provider status', response.status);
    return json(502, { error: 'provider_error' });
  }
  try {
    const result = await response.json();
    const text = typeof result?.text === 'string' ? result.text.trim().slice(0, 4000) : '';
    return json(200, { text });
  } catch {
    return json(502, { error: 'provider_bad_response' });
  }
});
