import { z } from 'zod';

import { MiteApiError } from '../errors.js';
import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { DATA_NOTICE, renderRow, ROW_HEADER, toRow } from './timeEntry.js';

export const getTimeEntry = defineTool({
  name: 'mite_get_time_entry',
  title: 'Get one time entry',
  description:
    'Fetches one time entry from mite by its id; use it when the id is known, otherwise find entries with `mite_list_time_entries`. ' +
    'Returns date, hours, revenue in currency units (null if none), billable and locked flags, customer, project, service, user and note. ' +
    'Fails with "not found" if no time entry has this id.',
  mode: 'read-only',
  annotations: { readOnlyHint: true, openWorldHint: true },
  inputSchema: z.object({
    id: z.number().int().positive().describe('Id of the time entry, e.g. 1234567. Required.'),
  }),
  handler: async ({ id }, { client }) => {
    let entry: MiteTimeEntry;
    try {
      entry = await client.get<MiteTimeEntry>(`/time_entries/${id}.json`);
    } catch (error) {
      if (error instanceof MiteApiError && error.status === 404) {
        throw new Error(`time entry ${id} not found`, { cause: error });
      }
      throw error;
    }
    const row = toRow(entry);
    return result([DATA_NOTICE, ROW_HEADER, renderRow(row)].join('\n'), { ...row });
  },
});
