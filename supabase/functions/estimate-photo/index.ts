// Estimates foods and nutrition from a meal photo with a vision model.
//
// The provider key (AI_API_KEY) is an Edge Function secret and never reaches
// the client. The image is processed in memory and not stored or logged.
// The response is only a suggestion: the app shows it as a draft that the
// user must review and confirm.
//
// Secrets / env:
//   AI_API_KEY        required, OpenAI-compatible API key
//   AI_BASE_URL       optional, default https://api.openai.com/v1
//   AI_VISION_MODEL   optional, default gpt-4o-mini
import { appLanguage, checkBase64, cors, json, requireUser } from '../_shared/http.ts';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UNITS = new Set(['g', 'ml', 'piece', 'serving']);
const LANGUAGE_NAMES = { en: 'English', ru: 'Russian', fi: 'Finnish' } as const;

const PROMPT = (language: string) => `You are a nutrition assistant. Identify every distinct food or drink in the photo
and estimate the eaten amount and its nutrition. Reply with JSON only:
{"items":[{"food_name":string,"quantity":number,"unit":"g"|"ml"|"piece"|"serving",
"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":number}]}
Values are for the whole estimated amount, calories in kcal, confidence between 0 and 1.
Write food_name in ${language}. If the photo shows no food, reply {"items":[]}.`;

function num(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? Math.round(value * 10) / 10 : null;
}

function sanitize(raw: unknown): unknown[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.slice(0, 30).flatMap((i) => {
    const item = i as Record<string, unknown>;
    const name = typeof item.food_name === 'string' ? item.food_name.trim().slice(0, 200) : '';
    const quantity = num(item.quantity, 10000);
    if (!name || !quantity) return [];
    return [
      {
        food_name: name,
        quantity,
        unit: typeof item.unit === 'string' && UNITS.has(item.unit) ? item.unit : 'serving',
        calories: num(item.calories, 10000),
        protein_g: num(item.protein_g, 1000),
        carbs_g: num(item.carbs_g, 1000),
        fat_g: num(item.fat_g, 1000),
        confidence: num(item.confidence, 1),
      },
    ];
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const userId = await requireUser(req);
  if (!userId) return json(401, { error: 'unauthorized' });

  const apiKey = Deno.env.get('AI_API_KEY');
  if (!apiKey) return json(503, { error: 'not_configured' });

  let body: { imageBase64?: unknown; mimeType?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (typeof body.mimeType !== 'string' || !MIME_TYPES.has(body.mimeType)) return json(400, { error: 'unsupported_type' });
  const payloadError = checkBase64(body.imageBase64, MAX_IMAGE_BYTES);
  if (payloadError) return json(payloadError === 'payload_too_large' ? 413 : 400, { error: payloadError });

  const model = Deno.env.get('AI_VISION_MODEL') ?? 'gpt-4o-mini';
  const baseUrl = (Deno.env.get('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT(LANGUAGE_NAMES[appLanguage(body.locale)]) },
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: `data:${body.mimeType};base64,${body.imageBase64 as string}` } }],
          },
        ],
      }),
    });
  } catch {
    return json(502, { error: 'provider_unreachable' });
  }
  if (!response.ok) {
    console.error('estimate-photo provider status', response.status);
    return json(502, { error: 'provider_error' });
  }
  try {
    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    const items = sanitize(typeof content === 'string' ? JSON.parse(content) : null);
    return json(200, { items, model });
  } catch {
    return json(502, { error: 'provider_bad_response' });
  }
});
