import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

/** Fields a time entry can be written with; input uses hours, mite stores minutes. */
export const entryFields = {
  date_at: date.describe('Date of the entry (YYYY-MM-DD).'),
  hours: z.number().min(0).max(24).describe('Duration in hours, e.g. 1.5.'),
  note: z.string().max(10_000).describe('Note of the entry.'),
  project_id: z.number().int().positive().describe('Id of the project.'),
  service_id: z.number().int().positive().describe('Id of the service.'),
};

export const dryRun = z
  .boolean()
  .default(false)
  .describe('true = only show a preview of the change and write nothing.');

/** Admin-only parameter: write to a locked time entry, always together with a `confirm_token`. */
export const force = z
  .boolean()
  .optional()
  .describe(
    'true = also change a locked entry. Needs a confirm_token: the first call returns a preview and a token.',
  );

/** Path of a time entry; `force` is only sent for an explicit `force: true` in mode `admin`. */
export const entryPath = (id: number, forced: boolean): string =>
  `/time_entries/${id}.json${forced ? '?force=true' : ''}`;

type Fields = { [K in keyof typeof entryFields]?: z.infer<(typeof entryFields)[K]> | undefined };

/** Translates the given fields into the body of a mite time entry. */
export function toBody(fields: Fields): { time_entry: Record<string, unknown> } {
  const { hours, ...rest } = fields;
  return {
    time_entry: {
      ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
      ...(hours === undefined ? {} : { minutes: Math.round(hours * 60) }),
    },
  };
}

/** The given fields as readable pairs; notes are quoted because they are data. */
export function definedFields(fields: Fields): [string, string | number][] {
  return Object.entries(fields).filter(
    (pair): pair is [string, string | number] => pair[1] !== undefined,
  );
}
