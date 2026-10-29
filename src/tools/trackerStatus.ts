import { z } from 'zod';

import type { MiteTracker } from '../mite/types.js';
import { defineTool, result } from './definition.js';

export const trackerStatus = defineTool({
  name: 'mite_tracker_status',
  title: 'Tracker status',
  description:
    "Tells whether the mite time tracker is currently running for the key's user and, if so, on which time entry. " +
    "Returns `running` and, when it runs, `time_entry_id`, the start time `since` and `minutes`, the entry's total so far in minutes. " +
    'Read-only and takes no input; to look at that entry in full use `mite_get_time_entry`.',
  mode: 'read-only',
  annotations: { readOnlyHint: true, openWorldHint: true },
  inputSchema: z.object({}),
  handler: async (_input, { client }) => {
    const { tracker } = await client.get<MiteTracker>('/tracker.json');
    const running = tracker.tracking_time_entry;
    if (running === undefined) {
      return result('The tracker is not running.', { running: false });
    }
    const data = {
      running: true,
      time_entry_id: running.id,
      minutes: running.minutes,
      since: running.since,
    };
    return result(
      `The tracker is running on time entry ${data.time_entry_id} since ${data.since}; the entry now has ${data.minutes} min in total.`,
      data,
    );
  },
});
