import { z } from 'zod';

const KEYWORDS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_year',
  'last_year',
] as const;

/** A date as mite accepts it: YYYY-MM-DD or one of mite's relative keywords. */
export const periodValue = z
  .string()
  .refine(
    (value) =>
      (KEYWORDS as readonly string[]).includes(value) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))),
    { message: `Use YYYY-MM-DD or one of: ${KEYWORDS.join(', ')}` },
  );

export const periodShape = {
  from: periodValue
    .optional()
    .describe('Start date (YYYY-MM-DD) or a keyword such as this_month. Default: this_year.'),
  to: periodValue
    .optional()
    .describe('End date (YYYY-MM-DD) or a keyword. Default: the end of the period given in from.'),
};

/** Translates the optional from/to input into mite query parameters. */
export function periodQuery(input: { from?: string | undefined; to?: string | undefined }): {
  at?: string;
  from?: string;
  to?: string;
} {
  if (input.from === undefined && input.to === undefined) {
    return { at: 'this_year' };
  }
  if (input.to === undefined) {
    return KEYWORDS.includes(input.from as (typeof KEYWORDS)[number])
      ? { at: input.from as string }
      : { from: input.from as string, to: 'today' };
  }
  return { from: input.from ?? input.to, to: input.to };
}
