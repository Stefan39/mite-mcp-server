import { z } from 'zod';

import type { MiteTracker } from '../mite/types.js';
import { defineTool, result } from './definition.js';

const inputSchema = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      'Id of the time entry whose tracker to use, e.g. 12345. Find ids with `mite_list_time_entries`.',
    ),
});

const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const startTracker = defineTool({
  name: 'mite_start_tracker',
  title: 'Start the tracker',
  description:
    'Starts the mite time tracker on an existing time entry, so mite counts the running time onto it; use `mite_tracker_status` to see what is running and `mite_create_time_entry` first if no entry exists yet. ' +
    'Returns `running: true` and the time entry id; the hours are not returned, read them later with `mite_get_time_entry`. ' +
    'Needs mode write or admin. A tracker that is already running is stopped first, so only one entry runs at a time.',
  mode: 'write',
  annotations,
  inputSchema,
  handler: async ({ id }, { client }) => {
    await client.write<MiteTracker>('PATCH', `/tracker/${id}.json`);
    return result(`The tracker is running on time entry ${id}.`, {
      running: true,
      time_entry_id: id,
    });
  },
});

export const stopTracker = defineTool({
  name: 'mite_stop_tracker',
  title: 'Stop the tracker',
  description:
    'Stops the mite time tracker on a time entry, which keeps the time counted so far; use `mite_tracker_status` to see which entry is running and `mite_start_tracker` to start one. ' +
    'Returns `running: false` and the time entry id; the hours are not returned, read them with `mite_get_time_entry`. ' +
    'Needs mode write or admin.',
  mode: 'write',
  annotations,
  inputSchema,
  handler: async ({ id }, { client }) => {
    await client.write<MiteTracker>('DELETE', `/tracker/${id}.json`);
    return result(`The tracker on time entry ${id} is stopped.`, {
      running: false,
      time_entry_id: id,
    });
  },
});
