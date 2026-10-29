import { z } from 'zod';

import { askHuman } from '../elicit.js';
import { MiteApiError } from '../errors.js';
import type { MiteTimeEntry } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { toRow, type TimeEntryRow } from './timeEntry.js';
import {
  definedFields,
  describeChange,
  dryRun,
  entryFields,
  entryPath,
  force,
  toBody,
} from './writeFields.js';

const inputSchema = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe(
      'Id of the time entry to change, e.g. 12345. Find ids with `mite_list_time_entries`.',
    ),
  date_at: entryFields.date_at.optional(),
  hours: entryFields.hours.optional(),
  note: entryFields.note.optional(),
  project_id: entryFields.project_id.optional(),
  service_id: entryFields.service_id.optional(),
  dry_run: dryRun,
});

const adminInputSchema = inputSchema.extend({
  force,
  confirm_token: z
    .string()
    .optional()
    .describe(
      'Token from the preview call, e.g. the `confirm_token` value it returned; required with `force: true`, valid for 5 minutes and usable once. Default: none.',
    ),
});

const NAME = 'mite_update_time_entry';

const currentValue = (row: TimeEntryRow, field: string): string | number =>
  (row as unknown as Record<string, string | number>)[field] ?? '';

export const updateTimeEntry = defineTool({
  name: NAME,
  title: 'Update a time entry',
  description:
    'Changes fields of an existing time entry (date, hours, note, project, service); fields that are not given stay as they are, but at least one must be given. Use `mite_create_time_entry` for a new entry. ' +
    'Returns the names of the updated fields; with `dry_run: true` it returns current and new values and writes nothing. ' +
    'Needs mode write or admin. A locked entry cannot be changed; in mode admin, `force: true` changes a locked entry in two steps: ' +
    'the first call (or dry_run: true) returns a preview and a confirm_token; only a second call with that token, ' +
    'valid for 5 minutes and usable once, writes.',
  mode: 'write',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema,
  adminInputSchema,
  handler: async (input, { client, config, confirmations, elicit }) => {
    const {
      id,
      dry_run,
      force: forceInput,
      confirm_token: token,
      ...fields
    } = input as typeof input & {
      confirm_token?: string;
    };
    const forced = config.mode === 'admin' && forceInput === true;
    const changes = definedFields(fields);
    if (changes.length === 0) {
      throw new Error('nothing to update: give at least one field to change');
    }
    const tokenArguments = { id, ...fields, ...(forced ? { force: true } : {}) };
    if (dry_run || (forced && token === undefined)) {
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
      const confirmToken = forced ? confirmations.issue(NAME, tokenArguments) : undefined;
      const state = row.locked ? (forced ? ' is locked' : ' is locked and cannot be changed') : '';
      return result(
        [
          `Preview, nothing was written. Time entry ${id}${state}; would change:`,
          ...lines,
          ...(confirmToken === undefined
            ? []
            : [
                `To write, call ${NAME} again with force: true and confirm_token (valid for 5 minutes, usable once).`,
                `confirm_token: ${confirmToken}`,
              ]),
        ].join('\n'),
        {
          dry_run: true,
          id,
          locked: row.locked,
          changes: diff,
          ...(confirmToken === undefined ? {} : { confirm_token: confirmToken }),
        },
      );
    }
    if (forced) {
      const invalid = (): Error =>
        new Error(
          `confirm_token is invalid, expired, already used or was issued for other arguments; nothing written. Call ${NAME} with force: true and without confirm_token to get a new preview.`,
        );
      if (token === undefined || !confirmations.check(NAME, tokenArguments, token)) throw invalid();
      await askHuman(
        elicit,
        `Change locked time entry ${id} (force): ${changes.map(([field, value]) => describeChange(field, value)).join(', ')}?`,
        'nothing written',
      );
      if (!confirmations.consume(NAME, tokenArguments, token)) throw invalid();
    }
    try {
      await client.write('PATCH', entryPath(id, forced), toBody(fields));
    } catch (error) {
      if (error instanceof MiteApiError && error.status === 423) {
        throw new Error(`time entry ${id} is locked and cannot be changed`, { cause: error });
      }
      throw error;
    }
    return result(
      `Time entry ${id} updated: ${changes.map(([field, value]) => describeChange(field, value)).join(', ')}.`,
      {
        dry_run: false,
        id,
        updated: changes.map(([field]) => field),
      },
    );
  },
});
