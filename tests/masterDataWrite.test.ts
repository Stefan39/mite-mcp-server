import { describe, expect, it } from 'vitest';

import { ConfirmationTokens, TOKEN_TTL_MS } from '../src/confirm.js';
import type { Mode } from '../src/config.js';
import { allTools } from '../src/tools/index.js';
import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const entities = [
  { entity: 'customer', resource: 'customers', create: { name: 'Acme' } },
  {
    entity: 'project',
    resource: 'projects',
    create: { name: 'Site', customer_id: 7, budget: 600, budget_type: 'minutes' },
  },
  { entity: 'service', resource: 'services', create: { name: 'Dev', billable: true } },
] as const;

const allNames = entities.flatMap(({ entity }) => [
  `mite_create_${entity}`,
  `mite_update_${entity}`,
  `mite_delete_${entity}`,
]);

const setup = async (
  resource: string,
  entity: string,
  options: { deleteStatus?: number; mode?: Mode } = {},
) => {
  let now = 1_000_000;
  const confirmations = new ConfirmationTokens(() => now);
  const { fetch, requests } = fakeFetch({
    [`/${resource}.json`]: () => json({ [entity]: { id: 5, name: 'Acme' } }, 201),
    [`/${resource}/5.json`]: () => {
      const last = requests[requests.length - 1];
      if (last?.method === 'DELETE' && options.deleteStatus !== undefined) {
        return json({ error: 'time entries still exist' }, options.deleteStatus);
      }
      return last?.method === 'GET'
        ? json({ [entity]: { id: 5, name: 'Acme' } })
        : new Response('', { status: 200 });
    },
  });
  const client = await connect(
    config({ mode: options.mode ?? 'admin' }),
    miteClient(fetch),
    allTools,
    confirmations,
  );
  const writes = (method: string) => requests.filter((request) => request.method === method);
  return {
    client,
    requests,
    writes,
    advance: (ms: number) => {
      now += ms;
    },
    call: (name: string, args: Record<string, unknown>) =>
      client.callTool({ name, arguments: args }),
  };
};

describe('master data write tools', () => {
  it.each(['read-only', 'write'] as const)(
    'registers none of the nine in mode %s',
    async (mode) => {
      const { client } = await setup('customers', 'customer', { mode });
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      for (const name of allNames) expect(names).not.toContain(name);
    },
  );

  it('registers all nine in mode admin with the declared annotations', async () => {
    const { client } = await setup('customers', 'customer');
    const tools = (await client.listTools()).tools;
    for (const name of allNames) {
      const tool = tools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      const isCreate = name.startsWith('mite_create_');
      expect(tool?.annotations, name).toMatchObject({
        readOnlyHint: false,
        destructiveHint: !isCreate,
        idempotentHint: !isCreate,
      });
    }
  });

  describe.each(entities)('$entity', ({ entity, resource, create }) => {
    const PATH = `/${resource}/5.json`;

    it('create: dry_run sends nothing, otherwise exactly one POST with the fields', async () => {
      const { call, requests, writes } = await setup(resource, entity);
      const preview = await call(`mite_create_${entity}`, { ...create, dry_run: true });
      expect(preview.isError).toBeFalsy();
      expect(requests).toHaveLength(0);

      const created = await call(`mite_create_${entity}`, create);
      expect(created.isError).toBeFalsy();
      expect(writes('POST')).toHaveLength(1);
      expect(writes('POST')[0]?.url.pathname).toBe(`/${resource}.json`);
      expect(writes('POST')[0]?.body).toEqual({ [entity]: create });
    });

    it('update: dry_run sends nothing, otherwise exactly one PATCH', async () => {
      const { call, requests, writes } = await setup(resource, entity);
      await call(`mite_update_${entity}`, { id: 5, name: 'New', dry_run: true });
      expect(requests).toHaveLength(0);

      const updated = await call(`mite_update_${entity}`, { id: 5, name: 'New' });
      expect(updated.isError).toBeFalsy();
      expect(writes('PATCH')).toHaveLength(1);
      expect(writes('PATCH')[0]?.url.pathname).toBe(PATH);
      expect(writes('PATCH')[0]?.body).toEqual({ [entity]: { name: 'New' } });
    });

    it('update: archived sends archived to mite, including false', async () => {
      const { call, writes } = await setup(resource, entity);
      await call(`mite_update_${entity}`, { id: 5, archived: true });
      await call(`mite_update_${entity}`, { id: 5, archived: false });
      expect(writes('PATCH').map((request) => request.body)).toEqual([
        { [entity]: { archived: true } },
        { [entity]: { archived: false } },
      ]);
    });

    it('update: refuses an empty change', async () => {
      const { call, requests } = await setup(resource, entity);
      expect((await call(`mite_update_${entity}`, { id: 5 })).isError).toBe(true);
      expect(requests).toHaveLength(0);
    });

    describe('delete', () => {
      const name = `mite_delete_${entity}`;
      const token = async (ctx: Awaited<ReturnType<typeof setup>>): Promise<string> =>
        ((await ctx.call(name, { id: 5 })).structuredContent as { confirm_token: string })
          .confirm_token;

      it('previews without a token and sends no DELETE', async () => {
        const ctx = await setup(resource, entity);
        const result = await ctx.call(name, { id: 5 });
        expect(result.isError).toBeFalsy();
        expect(ctx.writes('DELETE')).toHaveLength(0);
        const withToken = await ctx.call(name, {
          id: 5,
          confirm_token: await token(ctx),
          dry_run: true,
        });
        expect(withToken.isError).toBeFalsy();
        expect(ctx.writes('DELETE')).toHaveLength(0);
      });

      it.each([
        ['missing', () => Promise.resolve(undefined), {}],
        ['wrong', () => Promise.resolve(`1300000.${'0'.repeat(64)}`), {}],
        ['foreign-argument', undefined, { id: 6 }],
      ])('rejects a %s token without a DELETE', async (_label, make, override) => {
        const ctx = await setup(resource, entity);
        const confirm = make === undefined ? await token(ctx) : await make();
        const result = await ctx.call(name, { id: 5, confirm_token: confirm, ...override });
        if (confirm === undefined) {
          expect(result.isError).toBeFalsy(); // no token is a preview
        } else {
          expect(result.isError).toBe(true);
        }
        expect(ctx.writes('DELETE')).toHaveLength(0);
      });

      it('rejects an expired token', async () => {
        const ctx = await setup(resource, entity);
        const issued = await token(ctx);
        ctx.advance(TOKEN_TTL_MS + 1);
        expect((await ctx.call(name, { id: 5, confirm_token: issued })).isError).toBe(true);
        expect(ctx.writes('DELETE')).toHaveLength(0);
      });

      it('sends exactly one DELETE for a valid token and rejects reuse', async () => {
        const ctx = await setup(resource, entity);
        const issued = await token(ctx);
        const done = await ctx.call(name, { id: 5, confirm_token: issued });
        expect(done.structuredContent).toEqual({ deleted: true, id: 5 });
        expect(ctx.writes('DELETE')).toHaveLength(1);
        expect(ctx.writes('DELETE')[0]?.url.pathname).toBe(PATH);

        const again = await ctx.call(name, { id: 5, confirm_token: issued });
        expect(again.isError).toBe(true);
        expect(ctx.writes('DELETE')).toHaveLength(1);
      });

      it('returns a refused deletion (422) as a readable error', async () => {
        const ctx = await setup(resource, entity, { deleteStatus: 422 });
        const issued = await token(ctx);
        const result = await ctx.call(name, { id: 5, confirm_token: issued });
        expect(result.isError).toBe(true);
        const text = JSON.stringify(result.content);
        expect(text).toContain(`${entity} 5 cannot be deleted`);
        expect(text).toContain('time entries still exist');
      });
    });
  });
});

describe('update messages', () => {
  const text = (result: { content?: unknown }): string =>
    (result.content as { text: string }[])[0]?.text ?? '';

  it('name the new value, so archiving and restoring differ', async () => {
    const { call } = await setup('projects', 'project');
    const archived = text(await call('mite_update_project', { id: 5, archived: true }));
    const restored = text(await call('mite_update_project', { id: 5, archived: false }));
    expect(archived).toBe('Project 5 updated: archived = true (archived).');
    expect(restored).toBe('Project 5 updated: archived = false (restored).');
  });

  it('shorten a long note to 80 characters', async () => {
    const { call } = await setup('projects', 'project');
    const message = text(await call('mite_update_project', { id: 5, note: 'x'.repeat(200) }));
    expect(message).toBe(`Project 5 updated: note = "${'x'.repeat(80)}…".`);
  });
});
