import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ConfirmationTokens, TOKEN_TTL_MS } from '../src/confirm.js';
import { allTools } from '../src/tools/index.js';
import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const fixture = (name: string): { time_entry: object } =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as {
    time_entry: object;
  };

const PATH = '/time_entries/169895688.json';
const NAME = 'mite_delete_time_entry';

const setup = async (
  options: { locked?: boolean; deleteStatus?: number } = {},
  mode: 'read-only' | 'write' = 'write',
) => {
  let now = 1_000_000;
  const confirmations = new ConfirmationTokens(() => now);
  const { fetch, requests } = fakeFetch({
    [PATH]: () => {
      return json({
        time_entry: { ...fixture('time_entry').time_entry, locked: options.locked ?? false },
      });
    },
  });
  // Route by method: GET returns the entry, DELETE answers with the configured status.
  const routed: typeof fetch = (input, init) =>
    init?.method === 'DELETE'
      ? (requests.push({
          method: 'DELETE',
          url: new URL(input),
          headers: {},
        }),
        Promise.resolve(
          options.deleteStatus === undefined || options.deleteStatus < 400
            ? new Response('', { status: 200 })
            : json({ error: 'locked' }, options.deleteStatus),
        ))
      : fetch(input, init);
  const client = await connect(config({ mode }), miteClient(routed), allTools, confirmations);
  const run = (args: Record<string, unknown>) => client.callTool({ name: NAME, arguments: args });
  const preview = async (args: Record<string, unknown> = { id: 169895688 }): Promise<string> =>
    (
      (await run(args)).structuredContent as {
        confirm_token: string;
      }
    ).confirm_token;
  const deletes = () => requests.filter((request) => request.method === 'DELETE');
  return {
    run,
    preview,
    deletes,
    client,
    requests,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('mite_delete_time_entry', () => {
  it('is registered in write mode only', async () => {
    const names = async (mode: 'read-only' | 'write') =>
      (await (await setup({}, mode)).client.listTools()).tools.map((tool) => tool.name);
    expect(await names('read-only')).not.toContain(NAME);
    expect(await names('write')).toContain(NAME);
  });

  it('declares destructive, idempotent, not read-only', async () => {
    const { client } = await setup();
    const tool = (await client.listTools()).tools.find((t) => t.name === NAME);
    expect(tool?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
  });

  it('previews without a token and does not delete', async () => {
    const { run, deletes } = await setup();
    const result = await run({ id: 169895688 });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { deleted: boolean; confirm_token: string };
    expect(data.deleted).toBe(false);
    expect(data.confirm_token).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(deletes()).toHaveLength(0);
  });

  it('previews on dry_run even with a valid token', async () => {
    const { run, preview, deletes } = await setup();
    const token = await preview();
    const result = await run({ id: 169895688, confirm_token: token, dry_run: true });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { deleted: boolean }).deleted).toBe(false);
    expect(deletes()).toHaveLength(0);
  });

  it('sends exactly one DELETE for a valid token within 5 minutes', async () => {
    const { run, preview, deletes, advance } = await setup();
    const token = await preview();
    advance(TOKEN_TTL_MS - 1);
    const result = await run({ id: 169895688, confirm_token: token });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ deleted: true, id: 169895688 });
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]?.url.pathname).toBe(PATH);
  });

  it('rejects a wrong token', async () => {
    const { run, deletes } = await setup();
    const result = await run({ id: 169895688, confirm_token: `1300000.${'0'.repeat(64)}` });
    expect(result.isError).toBe(true);
    expect(deletes()).toHaveLength(0);
  });

  it('rejects a malformed token', async () => {
    const { run, deletes } = await setup();
    const result = await run({ id: 169895688, confirm_token: 'nonsense' });
    expect(result.isError).toBe(true);
    expect(deletes()).toHaveLength(0);
  });

  it('rejects an expired token', async () => {
    const { run, preview, deletes, advance } = await setup();
    const token = await preview();
    advance(TOKEN_TTL_MS + 1);
    const result = await run({ id: 169895688, confirm_token: token });
    expect(result.isError).toBe(true);
    expect(deletes()).toHaveLength(0);
  });

  it('rejects a token issued for other arguments', async () => {
    const { run, preview, deletes } = await setup();
    const token = await preview();
    const result = await run({ id: 169895689, confirm_token: token });
    expect(result.isError).toBe(true);
    expect(deletes()).toHaveLength(0);
  });

  it('rejects a token issued for another tool', async () => {
    const confirmations = new ConfirmationTokens(() => 1_000_000);
    const { fetch, requests } = fakeFetch({});
    const client = await connect(
      config({ mode: 'write' }),
      miteClient(fetch),
      allTools,
      confirmations,
    );
    const token = confirmations.issue('mite_other_tool', { id: 169895688 });
    const result = await client.callTool({
      name: NAME,
      arguments: { id: 169895688, confirm_token: token },
    });
    expect(result.isError).toBe(true);
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(0);
  });

  it('rejects a token used a second time', async () => {
    const { run, preview, deletes } = await setup();
    const token = await preview();
    expect((await run({ id: 169895688, confirm_token: token })).isError).toBeFalsy();
    const second = await run({ id: 169895688, confirm_token: token });
    expect(second.isError).toBe(true);
    expect(deletes()).toHaveLength(1);
  });

  it('reports a locked entry already in the preview', async () => {
    const { run, deletes } = await setup({ locked: true });
    const result = await run({ id: 169895688 });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('is locked');
    expect(deletes()).toHaveLength(0);
  });

  it('turns HTTP 423 into the locked error', async () => {
    const { run, preview } = await setup({ deleteStatus: 423 });
    const token = await preview();
    const result = await run({ id: 169895688, confirm_token: token });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('is locked');
  });
});

describe('ConfirmationTokens', () => {
  it('ignores key order and the control arguments', () => {
    const tokens = new ConfirmationTokens(() => 0);
    const token = tokens.issue('t', { a: 1, b: { y: 1, x: 2 } });
    expect(
      tokens.consume('t', { b: { x: 2, y: 1 }, dry_run: false, a: 1, confirm_token: 'x' }, token),
    ).toBe(true);
  });

  it('forgets used tokens only once they have expired', () => {
    let now = 0;
    const tokens = new ConfirmationTokens(() => now);
    const token = tokens.issue('t', {});
    expect(tokens.consume('t', {}, token)).toBe(true);
    now = TOKEN_TTL_MS;
    expect(tokens.consume('t', {}, token)).toBe(false);
  });
});
