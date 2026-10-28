import { z } from 'zod';

import { MiteApiError } from '../errors.js';
import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { DATA_NOTICE, renderRow, ROW_HEADER, toRow } from './timeEntry.js';

const NAME = 'mite_delete_time_entry';

export const deleteTimeEntry = defineTool({
  name: NAME,
  title: 'Delete a time entry',
  description:
    'Deletes a time entry in two steps. The first call (or dry_run: true) returns a preview and a confirm_token; ' +
    'only a second call with that token, valid for 5 minutes and usable once, deletes the entry. ' +
    'Locked entries cannot be deleted.',
  mode: 'write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: z.object({
    id: z.number().int().positive().describe('Id of the time entry.'),
    confirm_token: z
      .string()
      .optional()
      .describe('Token from the preview call. Omit it to get a preview.'),
    dry_run: z.boolean().optional().describe('Only preview, even if a token is given.'),
  }),
  handler: async (input, { client, confirmations }) => {
    const { id, confirm_token: token, dry_run: dryRun } = input;

    if (token === undefined || dryRun === true) {
      let entry: MiteTimeEntry;
      try {
        entry = await client.get<MiteTimeEntry>(`/time_entries/${id}.json`);
      } catch (error) {
        throw missing(id, error);
      }
      const row = toRow(entry);
      if (row.locked) throw lockedError(id);
      const confirmToken = confirmations.issue(NAME, input);
      return result(
        [
          `Preview, nothing deleted yet. To delete time entry ${id}, call ${NAME} again with confirm_token (valid for 5 minutes, usable once).`,
          DATA_NOTICE,
          ROW_HEADER,
          renderRow(row),
          `confirm_token: ${confirmToken}`,
        ].join('\n'),
        { deleted: false, entry: { ...row }, confirm_token: confirmToken },
      );
    }

    if (!confirmations.consume(NAME, input, token)) {
      throw new Error(
        `confirm_token is invalid, expired, already used or was issued for other arguments; nothing deleted. Call ${NAME} without confirm_token to get a new preview.`,
      );
    }
    try {
      await client.delete(`/time_entries/${id}.json`);
    } catch (error) {
      if (error instanceof MiteApiError && error.status === 423) {
        throw lockedError(id, error);
      }
      throw missing(id, error);
    }
    return result(`Time entry ${id} deleted.`, { deleted: true, id });
  },
});

const lockedError = (id: number, cause?: unknown): Error =>
  new Error(`time entry ${id} is locked and cannot be deleted`, { cause });

/** Maps a 404 to a readable error and passes everything else through. */
const missing = (id: number, error: unknown): unknown =>
  error instanceof MiteApiError && error.status === 404
    ? new Error(`time entry ${id} not found`, { cause: error })
    : error;
