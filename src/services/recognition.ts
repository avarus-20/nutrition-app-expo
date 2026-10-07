import type { SupabaseClient } from '@supabase/supabase-js';

import { AppError, toAppError } from '@/utils/errors';

export interface PhotoEstimateRequest {
  imageBase64: string;
  mimeType: string;
  /** BCP 47 tag of the UI language; recognized food names use this language. */
  locale: string;
}

export interface PhotoEstimate {
  /** Raw recognizer items; validated by DraftService before anything is stored. */
  items: unknown[];
  model: string | null;
}

export interface TranscriptionRequest {
  audioBase64: string;
  mimeType: string;
  locale: string;
}

/**
 * Server-side AI boundary. Provider keys (vision / speech-to-text) exist only
 * in Supabase Edge Function secrets; the client calls the functions with the
 * user's session. Results are drafts that the user must confirm.
 */
export interface RecognitionGateway {
  estimatePhoto(request: PhotoEstimateRequest): Promise<PhotoEstimate>;
  transcribe(request: TranscriptionRequest): Promise<{ text: string }>;
}

/** Recognition is not possible (no backend configured, or signed out). */
export const unavailableRecognition: RecognitionGateway = {
  estimatePhoto: () => Promise.reject(new AppError('not_configured', 'Recognition is not available')),
  transcribe: () => Promise.reject(new AppError('not_configured', 'Recognition is not available')),
};

interface FunctionErrorLike {
  name?: string;
  message?: string;
  context?: { status?: number; json?: () => Promise<unknown> };
}

/** Maps a supabase-js functions error to an AppError with a stable code. */
export async function classifyFunctionError(error: unknown): Promise<AppError> {
  const e = (error ?? {}) as FunctionErrorLike;
  if (e.name === 'FunctionsFetchError' || e.name === 'FunctionsRelayError') {
    return new AppError('network', e.message ?? 'Function unreachable', { cause: error });
  }
  if (e.name === 'FunctionsHttpError') {
    const status = e.context?.status ?? 0;
    let code: string | null = null;
    try {
      const body = (await e.context?.json?.()) as { error?: unknown } | undefined;
      code = typeof body?.error === 'string' ? body.error : null;
    } catch {
      code = null;
    }
    if (status === 401 || status === 403) return new AppError('auth', 'Not authorized', { cause: error });
    if (code === 'not_configured') return new AppError('not_configured', 'Provider not configured', { cause: error });
    if (status === 400 || status === 413 || status === 422) {
      return new AppError('validation', code ?? 'Rejected input', { cause: error });
    }
    if (status === 429) return new AppError('rate_limited', code ?? 'HTTP 429', { cause: error });
    if (status >= 500) return new AppError('network', code ?? `HTTP ${status}`, { cause: error });
    return new AppError('unknown', code ?? `HTTP ${status}`, { cause: error });
  }
  return toAppError(error, 'unknown');
}

export class SupabaseRecognition implements RecognitionGateway {
  constructor(private readonly client: Pick<SupabaseClient, 'functions'>) {}

  private async invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    let response;
    try {
      response = await this.client.functions.invoke<T>(name, { body });
    } catch (error) {
      throw await classifyFunctionError(error);
    }
    if (response.error) throw await classifyFunctionError(response.error);
    if (response.data === null || typeof response.data !== 'object') {
      throw new AppError('unknown', `Unexpected ${name} response`);
    }
    return response.data;
  }

  async estimatePhoto(request: PhotoEstimateRequest): Promise<PhotoEstimate> {
    const data = await this.invoke<{ items?: unknown; model?: unknown }>('estimate-photo', { ...request });
    return {
      items: Array.isArray(data.items) ? data.items : [],
      model: typeof data.model === 'string' ? data.model : null,
    };
  }

  async transcribe(request: TranscriptionRequest): Promise<{ text: string }> {
    const data = await this.invoke<{ text?: unknown }>('transcribe', { ...request });
    if (typeof data.text !== 'string') throw new AppError('unknown', 'Unexpected transcribe response');
    return { text: data.text.slice(0, 4000) };
  }
}
