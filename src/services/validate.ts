import type { z } from 'zod';

import { fieldErrors } from '@/domain/validation';
import { AppError } from '@/utils/errors';

export function validate<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError('validation', 'Invalid input', { details: fieldErrors(result.error) });
  }
  return result.data;
}
