import { z } from 'zod';

import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { DATA_NOTICE, renderRow, ROW_HEADER, toRow } from './timeEntry.js';
import { definedFields, dryRun, entryFields, toBody } from './writeFields.js';

const inputSchema = z.object({
  date_at: entryFields.date_at
    .optional()
    .describe('Date of the entry (YYYY-MM-DD). Default: today.'),
  hours: entryFields.hours.optional(),
  note: entryFields.note.optional(),
  project_id: entryFields.project_id.optional(),
  service_id: entryFields.service_id.optional(),
  dry_run: dryRun,
});

export const createTimeEntry = defineTool({
  name: 'mite_create_time_entry',
  title: 'Create a time entry',
  description:
    'Creates a time entry for the user of the API key. ' +
    'With `dry_run: true` it only shows what would be created and writes nothing.',
  mode: 'write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema,
  handler: async ({ dry_run, ...fields }, { client }) => {
    if (dry_run) {
      const preview = Object.fromEntries(definedFields(fields));
      return result(
        `Preview, nothing was written. Would create a time entry with: ${JSON.stringify(preview)}`,
        { dry_run: true, would_create: preview },
      );
    }
    const created = await client.write<MiteTimeEntry>('POST', '/time_entries.json', toBody(fields));
    if (created === undefined) {
      throw new Error('mite created the time entry but sent no data back');
    }
    const row = toRow(created);
    return result(['Created:', DATA_NOTICE, ROW_HEADER, renderRow(row)].join('\n'), {
      dry_run: false,
      ...row,
    });
  },
});
