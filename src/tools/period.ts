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
    .describe(
      `Start of the period: a date as YYYY-MM-DD (e.g. 2026-01-01) or a keyword (${KEYWORDS.join(', ')}). ` +
        'A keyword alone selects that whole period and ignores the end of it; a date alone runs up to today. ' +
        'Default: this_year (when from and to are both omitted).',
    ),
  to: periodValue
    .optional()
    .describe(
      `End of the period: a date as YYYY-MM-DD (e.g. 2026-03-31) or a keyword (${KEYWORDS.join(', ')}). ` +
        'Default: today when only from is a date; without from the period is just this date.',
    ),
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
