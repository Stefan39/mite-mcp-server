import { z } from 'zod';

import { askHuman } from '../elicit.js';
import { MiteApiError } from '../errors.js';
import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { entryPath, force } from './writeFields.js';
import { DATA_NOTICE, renderRow, ROW_HEADER, toRow } from './timeEntry.js';

const NAME = 'mite_delete_time_entry';

const inputSchema = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      'Id of the time entry to delete, e.g. 12345. Find ids with `mite_list_time_entries`.',
    ),
  confirm_token: z
    .string()
    .optional()
    .describe(
      'Token from the preview call, e.g. the `confirm_token` value it returned. Omit it to get a preview. Valid for 5 minutes, usable once. Default: none.',
    ),
  dry_run: z
    .boolean()
    .optional()
    .describe('true = only preview, even if a token is given, e.g. true. Default: false.'),
});

export const deleteTimeEntry = defineTool({
  name: NAME,
  title: 'Delete a time entry',
  description:
    'Permanently deletes one time entry by id; look the id up with `mite_list_time_entries` first, and use `mite_update_time_entry` if the entry only needs correcting. ' +
    'Works in two steps: the first call (or dry_run: true) returns a preview of the entry (hours, revenue in currency units) and a confirm_token; ' +
    'only a second call with that token, valid for 5 minutes and usable once, deletes the entry and returns `deleted: true`. ' +
    'Needs mode write or admin. Locked entries cannot be deleted; in mode admin, `force: true` deletes a locked entry with the same two steps.',
  mode: 'write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema,
  adminInputSchema: inputSchema.extend({
    force: force.describe(
      'true = also delete a locked entry, e.g. true. Uses the same two steps; the token is only valid together with force: true. Default: false (locked entries are refused).',
    ),
  }),
  handler: async (input, { client, config, confirmations, elicit }) => {
    const { id, confirm_token: token, dry_run: dryRun } = input;
    const forced = config.mode === 'admin' && input.force === true;
    const tokenArguments = { id, ...(forced ? { force: true } : {}) };

    if (token === undefined || dryRun === true) {
      let entry: MiteTimeEntry;
      try {
        entry = await client.get<MiteTimeEntry>(`/time_entries/${id}.json`);
      } catch (error) {
        throw missing(id, error);
      }
      const row = toRow(entry);
      if (row.locked && !forced) throw lockedError(id);
      const confirmToken = confirmations.issue(NAME, tokenArguments);
      return result(
        [
          `Preview, nothing deleted yet. To delete time entry ${id}${row.locked ? ' (it is locked)' : ''}, call ${NAME} again with ${forced ? 'force: true and ' : ''}confirm_token (valid for 5 minutes, usable once).`,
          DATA_NOTICE,
          ROW_HEADER,
          renderRow(row),
          `confirm_token: ${confirmToken}`,
        ].join('\n'),
        { deleted: false, entry: { ...row }, confirm_token: confirmToken },
      );
    }

    const invalid = (): Error =>
      new Error(
        `confirm_token is invalid, expired, already used or was issued for other arguments; nothing deleted. Call ${NAME} without confirm_token to get a new preview.`,
      );
    if (!confirmations.check(NAME, tokenArguments, token)) throw invalid();
    await askHuman(
      elicit,
      `Delete time entry ${id}${forced ? ' even if it is locked (force)' : ''}?`,
      'nothing deleted',
    );
    if (!confirmations.consume(NAME, tokenArguments, token)) throw invalid();
    try {
      await client.delete(entryPath(id, forced));
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
