/**
 * Application error model. Every failure that reaches the UI is an AppError
 * with a stable `code`; screens map the code to a localized message.
 */
export type AppErrorCode =
  | 'database'
  | 'migration'
  | 'network'
  | 'sync'
  | 'auth'
  | 'auth_invalid_credentials'
  | 'auth_email_taken'
  | 'auth_weak_password'
  | 'permission_denied'
  | 'camera'
  | 'microphone'
  | 'upload'
  | 'validation'
  | 'invalid_import'
  | 'unsupported_version'
  | 'not_configured'
  | 'rate_limited'
  | 'not_found'
  | 'unsupported_platform'
  | 'unknown';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message?: string, options?: { cause?: unknown; details?: unknown }) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.details = options?.details;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export function toAppError(error: unknown, fallback: AppErrorCode = 'unknown'): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/network|fetch failed|Failed to fetch|timeout/i.test(message)) {
    return new AppError('network', message, { cause: error });
  }
  return new AppError(fallback, message, { cause: error });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
