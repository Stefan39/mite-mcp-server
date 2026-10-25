import { z } from 'zod';

import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { periodQuery, periodShape } from './period.js';
import { DATA_NOTICE, renderRow, ROW_HEADER, toRow, type TimeEntryRow } from './timeEntry.js';

const idList = z.array(z.number().int().positive()).min(1).optional();

const inputSchema = z.object({
  ...periodShape,
  customer_id: idList.describe('Only these customers.'),
  project_id: idList.describe('Only these projects.'),
  service_id: idList.describe('Only these services.'),
  user_id: idList.describe('Only these users (needs a key that may see other users).'),
  billable: z.boolean().optional().describe('true = only billable, false = only non-billable.'),
  locked: z.boolean().optional().describe('true = only locked, false = only unlocked.'),
  limit: z.number().int().min(1).max(1000).default(100).describe('Entries per page (1–1000).'),
  page: z.number().int().min(1).default(1).describe('Page number, starting at 1.'),
});

export function renderEntries(rows: TimeEntryRow[], hasMore: boolean): string {
  if (rows.length === 0) {
    return 'No time entries found.';
  }
  return [
    DATA_NOTICE,
    ROW_HEADER,
    ...rows.map(renderRow),
    ...(hasMore ? ['More entries exist: request the next page.'] : []),
  ].join('\n');
}

export const listTimeEntries = defineTool({
  name: 'mite_list_time_entries',
  title: 'List time entries',
  description:
    'Single time entries from mite for a period, newest first, with optional filters. ' +
    'Returns at most `limit` entries and `has_more` when further entries exist. ' +
    'For totals prefer the aggregated reports.',
  mode: 'read-only',
  annotations: { readOnlyHint: true, openWorldHint: true },
  inputSchema,
  handler: async (input, { client }) => {
    // mite sends no paging info: ask for one entry more to learn whether another page exists.
    const entries = await client.get<MiteTimeEntry[]>('/time_entries.json', {
      ...periodQuery(input),
      customer_id: input.customer_id,
      project_id: input.project_id,
      service_id: input.service_id,
      user_id: input.user_id,
      billable: input.billable,
      locked: input.locked,
      limit: input.limit + 1,
      page: input.page,
    });
    const hasMore = entries.length > input.limit;
    const rows = entries.slice(0, input.limit).map(toRow);
    return result(renderEntries(rows, hasMore), { rows, has_more: hasMore });
  },
});
