import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ConfirmationTokens, TOKEN_TTL_MS } from '../src/confirm.js';
import type { Mode } from '../src/config.js';
import { allTools } from '../src/tools/index.js';
import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const entry = (
  JSON.parse(readFileSync(new URL('./fixtures/time_entry.json', import.meta.url), 'utf8')) as {
    time_entry: object;
  }
).time_entry;

const ID = 169895688;
const PATH = `/time_entries/${ID}.json`;

const setup = async (mode: Mode = 'admin', writeStatus = 200, locked = true) => {
  let now = 1_000_000;
  const { fetch, requests } = fakeFetch({
    [PATH]: (url) =>
      url.search === '' && requests.at(-1)?.method === 'GET'
        ? json({ time_entry: { ...entry, locked } })
        : writeStatus >= 400
          ? json({ error: 'locked' }, writeStatus)
          : new Response('', { status: 200 }),
  });
  const client = await connect(
    config({ mode }),
    miteClient(fetch),
    allTools,
    new ConfirmationTokens(() => now),
  );
  const call = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args });
  const writes = () => requests.filter((request) => request.method !== 'GET');
  return { client, call, requests, writes, advance: (ms: number) => (now += ms) };
};

const TOOLS = [
  { name: 'mite_update_time_entry', method: 'PATCH', extra: { hours: 2 } },
  { name: 'mite_delete_time_entry', method: 'DELETE', extra: {} },
] as const;

describe.each(TOOLS)('$name with force', ({ name, method, extra }) => {
  const args = { id: ID, ...extra };
  const tokenOf = async (s: Awaited<ReturnType<typeof setup>>, more = {}) =>
    (
      (await s.call(name, { ...args, force: true, ...more })).structuredContent as {
        confirm_token: string;
      }
    ).confirm_token;

  it('is part of the input schema in admin mode only', async () => {
    for (const [mode, expected] of [
      ['write', false],
      ['admin', true],
    ] as const) {
      const { client } = await setup(mode);
      const tool = (await client.listTools()).tools.find((t) => t.name === name);
      expect('force' in (tool?.inputSchema.properties ?? {})).toBe(expected);
    }
  });

  it('does not send force in write mode, even if the agent passes it', async () => {
    const s = await setup('write');
    await s.call(name, { ...args, force: true, confirm_token: 'x' });
    expect(s.writes().every((w) => w.url.search === '')).toBe(true);
  });

  it('previews a locked entry with a token and writes nothing', async () => {
    const s = await setup();
    const result = await s.call(name, { ...args, force: true });
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain('is locked');
    expect(JSON.stringify(result.structuredContent)).toContain('confirm_token');
    expect(s.writes()).toHaveLength(0);
  });

  it('previews on dry_run even with a valid token', async () => {
    const s = await setup();
    const token = await tokenOf(s);
    const result = await s.call(name, {
      ...args,
      force: true,
      confirm_token: token,
      dry_run: true,
    });
    expect(result.isError).toBeFalsy();
    expect(s.writes()).toHaveLength(0);
  });

  it('sends exactly one request with force for a valid token', async () => {
    const s = await setup();
    const token = await tokenOf(s);
    const result = await s.call(name, { ...args, force: true, confirm_token: token });
    expect(result.isError).toBeFalsy();
    expect(s.writes()).toHaveLength(1);
    expect(s.writes()[0]?.method).toBe(method);
    expect(s.writes()[0]?.url.pathname).toBe(PATH);
    expect(s.writes()[0]?.url.searchParams.get('force')).toBe('true');
  });

  it.each([
    ['missing', () => undefined],
    ['wrong', () => `1300000.${'0'.repeat(64)}`],
  ])('sends no write for a %s token', async (_label, make) => {
    const s = await setup();
    const result = await s.call(name, { ...args, force: true, confirm_token: make() });
    expect(s.writes()).toHaveLength(0);
    expect(result.isError ?? false).toBe(make() === undefined ? false : true);
  });

  it('sends no write for an expired token', async () => {
    const s = await setup();
    const token = await tokenOf(s);
    s.advance(TOKEN_TTL_MS + 1);
    expect((await s.call(name, { ...args, force: true, confirm_token: token })).isError).toBe(true);
    expect(s.writes()).toHaveLength(0);
  });

  it('sends no write for a token issued for other arguments', async () => {
    const s = await setup();
    const token = await tokenOf(s);
    const other = await s.call(name, { ...args, id: ID + 1, force: true, confirm_token: token });
    expect(other.isError).toBe(true);
    expect(s.writes()).toHaveLength(0);
  });

  it('sends no write when a token from a call without force is used with force', async () => {
    const s = await setup('admin', 200, false);
    const issued = await s.call(name, { ...args, dry_run: true });
    const token =
      (issued.structuredContent as { confirm_token?: string } | undefined)?.confirm_token ?? 'none';
    expect((await s.call(name, { ...args, force: true, confirm_token: token })).isError).toBe(true);
    expect(s.writes()).toHaveLength(0);
  });

  it('sends no write for a reused token', async () => {
    const s = await setup();
    const token = await tokenOf(s);
    expect(
      (await s.call(name, { ...args, force: true, confirm_token: token })).isError,
    ).toBeFalsy();
    expect((await s.call(name, { ...args, force: true, confirm_token: token })).isError).toBe(true);
    expect(s.writes()).toHaveLength(1);
  });

  it('does not retry with force after a 423 without force', async () => {
    const s = await setup('admin', 423, false);
    const preview = await s.call(name, { ...args, dry_run: true });
    const token = (preview.structuredContent as { confirm_token?: string } | undefined)
      ?.confirm_token;
    const result = await s.call(name, {
      ...args,
      ...(token === undefined ? {} : { confirm_token: token }),
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('is locked');
    expect(s.writes()).toHaveLength(1);
    expect(s.writes()[0]?.url.search).toBe('');
  });
});
