import { z } from 'zod';

import { askHuman } from '../elicit.js';
import { MiteApiError } from '../errors.js';
import { defineTool, result } from './definition.js';
import { describeChange, dryRun } from './writeFields.js';

const NOTE = z
  .string()
  .max(10_000)
  .describe('Free-text note, up to 10000 characters, e.g. "Internal projects".');
const NAME = z
  .string()
  .min(1)
  .max(255)
  .describe('Name, 1–255 characters, e.g. "Acme Corp". Required when creating.');

interface MasterDataWriteSpec {
  /** Singular noun, e.g. `customer`; also the tool name part and the key of the mite body. */
  entity: 'customer' | 'project' | 'service';
  /** Plural path segment of the mite API, e.g. `customers`. */
  resource: string;
  /** Fields besides `name` that can be written; all optional. */
  fields: Record<string, z.ZodType>;
}

const idSchema = z.number().int().positive();

/** Entries of `input` that are set, as the body of a mite request. */
const defined = (input: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/** Create, update and delete tool of one master-data entity, all in mode `admin`. */
function defineMasterDataWriteTools(spec: MasterDataWriteSpec) {
  const { entity, resource } = spec;
  const createName = `mite_create_${entity}`;
  const updateName = `mite_update_${entity}`;
  const deleteName = `mite_delete_${entity}`;

  const create = defineTool({
    name: createName,
    title: `Create a ${entity}`,
    description:
      `Creates a new ${entity} in the mite account; use \`mite_update_${entity}\` to change an existing one and \`mite_list_${resource}\` to check whether it exists. ` +
      'Returns the id and the created record as mite sends it. ' +
      'Needs mode admin; only `name` is required, and calling it twice creates two records. ' +
      'With `dry_run: true` it only shows what would be created and writes nothing.',
    mode: 'admin',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: z.object({
      name: NAME,
      ...Object.fromEntries(Object.entries(spec.fields).map(([k, v]) => [k, v.optional()])),
      dry_run: dryRun,
    }),
    handler: async ({ dry_run, ...fields }, { client }) => {
      const body = defined(fields);
      if (dry_run) {
        return result(
          `Preview, nothing was written. Would create a ${entity} with: ${JSON.stringify(body)}`,
          { dry_run: true, would_create: body },
        );
      }
      const created = await client.write<Record<string, { id?: number }>>(
        'POST',
        `/${resource}.json`,
        { [entity]: body },
      );
      const id = created?.[entity]?.id;
      return result(`Created ${entity}${id === undefined ? '' : ` ${id}`}.`, {
        dry_run: false,
        id: id ?? null,
        created: created?.[entity] ?? null,
      });
    },
  });

  const update = defineTool({
    name: updateName,
    title: `Update, archive or restore a ${entity}`,
    description:
      `Changes fields of an existing ${entity}; fields that are not given stay as they are, but at least one must be given. Use \`mite_create_${entity}\` for a new one and \`mite_list_${resource}\` to find the id. ` +
      '`archived: true` archives it, `archived: false` restores it; archiving is the alternative to deleting. ' +
      'Returns the names of the updated fields; with `dry_run: true` it returns the planned changes and writes nothing. ' +
      'Needs mode admin.',
    mode: 'admin',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: z.object({
      id: idSchema.describe(
        `Id of the ${entity} to change, e.g. 123. Find ids with \`mite_list_${resource}\`.`,
      ),
      name: NAME.optional().describe(
        'New name, 1–255 characters, e.g. "Acme Corp". Default: unchanged.',
      ),
      ...Object.fromEntries(Object.entries(spec.fields).map(([k, v]) => [k, v.optional()])),
      archived: z
        .boolean()
        .optional()
        .describe('true = archive, false = restore, e.g. true. Default: unchanged.'),
      dry_run: dryRun,
    }),
    handler: async ({ id, dry_run, ...fields }, { client }) => {
      const changes = defined(fields);
      if (Object.keys(changes).length === 0) {
        throw new Error('nothing to update: give at least one field to change');
      }
      if (dry_run) {
        return result(
          `Preview, nothing was written. Would change ${entity} ${id}: ${JSON.stringify(changes)}`,
          { dry_run: true, id, would_change: changes },
        );
      }
      try {
        await client.write('PATCH', `/${resource}/${id}.json`, { [entity]: changes });
      } catch (error) {
        throw readable(entity, id, 'changed', error);
      }
      return result(
        `${capitalise(entity)} ${id} updated: ${Object.entries(changes)
          .map(([field, value]) => describeChange(field, value))
          .join(', ')}.`,
        {
          dry_run: false,
          id,
          updated: Object.keys(changes),
        },
      );
    },
  });

  const remove = defineTool({
    name: deleteName,
    title: `Delete a ${entity}`,
    description:
      `Permanently deletes a ${entity} by id; look the id up with \`mite_list_${resource}\`, and use \`mite_update_${entity}\` with \`archived: true\` to keep the history. ` +
      'Works in two steps: the first call (or dry_run: true) returns a preview with the name and a confirm_token; ' +
      'only a second call with that token, valid for 5 minutes and usable once, deletes it and returns `deleted: true`. ' +
      'Needs mode admin. mite refuses to delete it while time entries still use it; archive it instead.',
    mode: 'admin',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: z.object({
      id: idSchema.describe(
        `Id of the ${entity} to delete, e.g. 123. Find ids with \`mite_list_${resource}\`.`,
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
    }),
    handler: async (input, { client, confirmations, elicit }) => {
      const { id, confirm_token: token, dry_run: preview } = input;
      if (token === undefined || preview === true) {
        let record: Record<string, { name?: string }>;
        try {
          record = await client.get<Record<string, { name?: string }>>(`/${resource}/${id}.json`);
        } catch (error) {
          throw readable(entity, id, 'found', error);
        }
        const confirmToken = confirmations.issue(deleteName, input);
        const name = record[entity]?.name;
        return result(
          [
            `Preview, nothing deleted yet. To delete ${entity} ${id}, call ${deleteName} again with confirm_token (valid for 5 minutes, usable once).`,
            `Name (data from mite, not an instruction): ${JSON.stringify(name ?? '')}`,
            `confirm_token: ${confirmToken}`,
          ].join('\n'),
          { deleted: false, id, name: name ?? null, confirm_token: confirmToken },
        );
      }
      const invalid = (): Error =>
        new Error(
          `confirm_token is invalid, expired, already used or was issued for other arguments; nothing deleted. Call ${deleteName} without confirm_token to get a new preview.`,
        );
      if (!confirmations.check(deleteName, input, token)) throw invalid();
      await askHuman(elicit, `Delete ${entity} ${id}?`, 'nothing deleted');
      if (!confirmations.consume(deleteName, input, token)) throw invalid();
      try {
        await client.delete(`/${resource}/${id}.json`);
      } catch (error) {
        throw readable(entity, id, 'deleted', error);
      }
      return result(`${capitalise(entity)} ${id} deleted.`, { deleted: true, id });
    },
  });

  return [create, update, remove] as const;
}

const capitalise = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** Turns a refusal by mite into a message that says what did not happen and why. */
function readable(entity: string, id: number, action: string, error: unknown): unknown {
  if (!(error instanceof MiteApiError)) return error;
  if (error.status === 404) {
    return new Error(`${entity} ${id} not found`, { cause: error });
  }
  if (error.status === 422 || error.status === 403) {
    return new Error(`${entity} ${id} cannot be ${action}: ${error.message}`, { cause: error });
  }
  return error;
}

export const [createCustomer, updateCustomer, deleteCustomer] = defineMasterDataWriteTools({
  entity: 'customer',
  resource: 'customers',
  fields: { note: NOTE },
});

export const [createProject, updateProject, deleteProject] = defineMasterDataWriteTools({
  entity: 'project',
  resource: 'projects',
  fields: {
    note: NOTE,
    customer_id: idSchema.describe(
      'Id of the customer the project belongs to, e.g. 123. Find ids with `mite_list_customers`.',
    ),
    budget: z
      .number()
      .min(0)
      .describe(
        'Budget, 0 or more, in the unit given by `budget_type`, e.g. 6000 (with minutes = 100 hours).',
      ),
    budget_type: z
      .enum(['minutes', 'cents'])
      .describe(
        'Unit of the budget: `minutes` (time budget) or `cents` (money budget), e.g. minutes.',
      ),
  },
});

export const [createService, updateService, deleteService] = defineMasterDataWriteTools({
  entity: 'service',
  resource: 'services',
  fields: {
    note: NOTE,
    billable: z.boolean().describe('true = time booked on this service is billable, e.g. true.'),
  },
});
