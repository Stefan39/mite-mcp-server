import { z } from 'zod';

import type { MiteTracker } from '../mite/types.js';
import { defineTool, result } from './definition.js';

const inputSchema = z.object({
  id: z.number().int().positive().describe('Id of the time entry.'),
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
  description: 'Starts the mite time tracker on a time entry. A running tracker is stopped first.',
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
  description: 'Stops the mite time tracker on a time entry.',
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
