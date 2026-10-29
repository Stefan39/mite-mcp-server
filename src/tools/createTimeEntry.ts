import { z } from 'zod';

import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { DATA_NOTICE, renderRow, ROW_HEADER, toRow } from './timeEntry.js';
import { definedFields, dryRun, entryFields, toBody } from './writeFields.js';

const inputSchema = z.object({
  date_at: entryFields.date_at
    .optional()
    .describe('Date of the entry as YYYY-MM-DD, e.g. 2026-10-29. Default: today.'),
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
    'Creates a new time entry for the user of the API key; use it to book time, `mite_update_time_entry` to change an existing entry and `mite_start_tracker` to run a timer on one. ' +
    'Returns the created entry with its id, hours (not minutes) and revenue in currency units (null if none). ' +
    'Needs mode write or admin; no field is required by the tool, and calling it twice creates two entries. ' +
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
