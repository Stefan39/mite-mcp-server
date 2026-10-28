import { z } from 'zod';

import { MiteApiError } from '../errors.js';
import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { toRow, type TimeEntryRow } from './timeEntry.js';
import { definedFields, dryRun, entryFields, toBody } from './writeFields.js';

const inputSchema = z.object({
  id: z.number().int().positive().describe('Id of the time entry.'),
  date_at: entryFields.date_at.optional(),
  hours: entryFields.hours.optional(),
  note: entryFields.note.optional(),
  project_id: entryFields.project_id.optional(),
  service_id: entryFields.service_id.optional(),
  dry_run: dryRun,
});

const currentValue = (row: TimeEntryRow, field: string): string | number =>
  (row as unknown as Record<string, string | number>)[field] ?? '';

export const updateTimeEntry = defineTool({
  name: 'mite_update_time_entry',
  title: 'Update a time entry',
  description:
    'Changes fields of an existing time entry; fields that are not given stay as they are. ' +
    'With `dry_run: true` it shows current and new values and writes nothing. ' +
    'A locked entry cannot be changed.',
  mode: 'write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema,
  handler: async ({ id, dry_run, ...fields }, { client }) => {
    const changes = definedFields(fields);
    if (changes.length === 0) {
      throw new Error('nothing to update: give at least one field to change');
    }
    if (dry_run) {
      const row = toRow(await client.get<MiteTimeEntry>(`/time_entries/${id}.json`));
      const diff = changes.map(([field, value]) => ({
        field,
        current: currentValue(row, field),
        new: value,
      }));
      const lines = diff.map(
        (change) =>
          `${change.field}: ${JSON.stringify(change.current)} -> ${JSON.stringify(change.new)}`,
      );
      return result(
        [
          `Preview, nothing was written. Time entry ${id}${row.locked ? ' is locked and cannot be changed' : ''}; would change:`,
          ...lines,
        ].join('\n'),
        { dry_run: true, id, locked: row.locked, changes: diff },
      );
    }
    try {
      await client.write('PATCH', `/time_entries/${id}.json`, toBody(fields));
    } catch (error) {
      if (error instanceof MiteApiError && error.status === 423) {
        throw new Error(`time entry ${id} is locked and cannot be changed`, { cause: error });
      }
      throw error;
    }
    return result(`Time entry ${id} updated: ${changes.map(([field]) => field).join(', ')}.`, {
      dry_run: false,
      id,
      updated: changes.map(([field]) => field),
    });
  },
});
