import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const call = async (
  routes: Parameters<typeof fakeFetch>[0],
  name: string,
  args: Record<string, unknown>,
) => {
  const { fetch, requests } = fakeFetch(routes);
  const client = await connect(config({ mode: 'write' }), miteClient(fetch));
  return { result: await client.callTool({ name, arguments: args }), requests };
};

const writes = (requests: { method: string }[]) => requests.filter((r) => r.method !== 'GET');

const WRITE_TOOLS = [
  'mite_create_time_entry',
  'mite_start_tracker',
  'mite_stop_tracker',
  'mite_update_time_entry',
];

describe('write tool registration and annotations', () => {
  it('offers the four tools in write mode only', async () => {
    const names = async (mode: 'read-only' | 'write') =>
      (await (await connect(config({ mode }), miteClient(fakeFetch({}).fetch))).listTools()).tools
        .map((tool) => tool.name)
        .filter((name) => WRITE_TOOLS.includes(name))
        .sort();
    expect(await names('read-only')).toEqual([]);
    expect(await names('write')).toEqual(WRITE_TOOLS);
  });

  it('declares the annotations', async () => {
    const client = await connect(config({ mode: 'write' }), miteClient(fakeFetch({}).fetch));
    const { tools } = await client.listTools();
    const hints = (name: string) => {
      const { readOnlyHint, destructiveHint, idempotentHint } =
        tools.find((tool) => tool.name === name)?.annotations ?? {};
      return { readOnlyHint, destructiveHint, idempotentHint };
    };
    expect(hints('mite_create_time_entry')).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    });
    expect(hints('mite_update_time_entry')).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    });
    for (const name of ['mite_start_tracker', 'mite_stop_tracker']) {
      expect(hints(name)).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      });
    }
  });
});

describe('mite_create_time_entry', () => {
  const args = { date_at: '2026-10-28', hours: 1.5, note: 'Test', project_id: 1, service_id: 2 };

  it('sends no request on dry_run', async () => {
    const { result, requests } = await call({}, 'mite_create_time_entry', {
      ...args,
      dry_run: true,
    });
    expect(result.isError).toBeFalsy();
    expect(requests).toHaveLength(0);
    expect(result.structuredContent).toMatchObject({ dry_run: true });
  });

  it('sends exactly one POST with the given fields', async () => {
    const { result, requests } = await call(
      { '/time_entries.json': () => json(fixture('time_entry'), 201) },
      'mite_create_time_entry',
      args,
    );
    expect(result.isError).toBeFalsy();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.body).toEqual({
      time_entry: {
        date_at: '2026-10-28',
        minutes: 90,
        note: 'Test',
        project_id: 1,
        service_id: 2,
      },
    });
  });

  it('does not retry a POST after a server error', async () => {
    const { result, requests } = await call(
      { '/time_entries.json': () => json({ error: 'boom' }, 500) },
      'mite_create_time_entry',
      args,
    );
    expect(result.isError).toBe(true);
    expect(requests).toHaveLength(1);
  });
});

describe('mite_update_time_entry', () => {
  const route = { '/time_entries/169895688.json': () => json(fixture('time_entry')) };

  it('previews current and new values on dry_run without writing', async () => {
    const { result, requests } = await call(route, 'mite_update_time_entry', {
      id: 169895688,
      hours: 2,
      dry_run: true,
    });
    expect(result.isError).toBeFalsy();
    expect(writes(requests)).toHaveLength(0);
    expect(result.structuredContent).toMatchObject({
      dry_run: true,
      changes: [{ field: 'hours', current: 0.17, new: 2 }],
    });
  });

  it('sends exactly one PATCH with the given fields', async () => {
    const { result, requests } = await call(
      { '/time_entries/169895688.json': () => new Response(null, { status: 200 }) },
      'mite_update_time_entry',
      { id: 169895688, hours: 2, note: 'New' },
    );
    expect(result.isError).toBeFalsy();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('PATCH');
    expect(requests[0]?.body).toEqual({ time_entry: { minutes: 120, note: 'New' } });
  });

  it('reports a locked entry (423) clearly', async () => {
    const { result, requests } = await call(
      { '/time_entries/169895688.json': () => json({ error: 'locked' }, 423) },
      'mite_update_time_entry',
      { id: 169895688, hours: 2 },
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('time entry 169895688 is locked');
    expect(requests).toHaveLength(1);
  });

  it('rejects an update without fields', async () => {
    const { result, requests } = await call({}, 'mite_update_time_entry', { id: 1 });
    expect(result.isError).toBe(true);
    expect(requests).toHaveLength(0);
  });
});

describe('tracker tools', () => {
  it('start sends one PATCH for the entry', async () => {
    const { result, requests } = await call(
      { '/tracker/5.json': () => json(fixture('tracker_running')) },
      'mite_start_tracker',
      { id: 5 },
    );
    expect(result.isError).toBeFalsy();
    expect(requests.map((r) => [r.method, r.url.pathname])).toEqual([['PATCH', '/tracker/5.json']]);
  });

  it('stop sends one DELETE for the entry', async () => {
    const { result, requests } = await call(
      { '/tracker/5.json': () => json(fixture('tracker')) },
      'mite_stop_tracker',
      { id: 5 },
    );
    expect(result.isError).toBeFalsy();
    expect(requests.map((r) => [r.method, r.url.pathname])).toEqual([
      ['DELETE', '/tracker/5.json'],
    ]);
  });
});
