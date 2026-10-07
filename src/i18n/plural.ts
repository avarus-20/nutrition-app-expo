export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** Declares plural forms (keeps dictionary types uniform across languages). */
export const plural = (forms: PluralForms): PluralForms => forms;

export function isPluralForms(value: unknown): value is PluralForms {
  return typeof value === 'object' && value !== null && 'other' in value;
}
