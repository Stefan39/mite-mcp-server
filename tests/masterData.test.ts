import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

const call = async (name: string, resource: string, args: Record<string, unknown> = {}) => {
  const { fetch, requests } = fakeFetch({
    [`/${resource}.json`]: () => json(fixture(resource)),
    [`/${resource}/archived.json`]: () => json(fixture(`${resource}_archived`)),
  });
  const client = await connect(config(), miteClient(fetch));
  const result = await client.callTool({ name, arguments: args });
  return { result, paths: requests.map((r) => r.url.pathname) };
};

const rowsOf = (result: { structuredContent?: unknown }): Record<string, unknown>[] =>
  (result.structuredContent as { rows: Record<string, unknown>[] }).rows;

const cases = [
  {
    tool: 'mite_list_customers',
    resource: 'customers',
    active: { id: 644036, name: 'Customer 1', archived: false, note: '' },
    archived: { id: 333615, name: 'Customer 4', archived: true, note: '' },
  },
  {
    tool: 'mite_list_projects',
    resource: 'projects',
    active: {
      id: 4548962,
      name: 'Project 1',
      customer_id: 890048,
      customer_name: 'Customer 3',
      archived: false,
      budget: 0,
      budget_type: 'minutes',
      note: '',
    },
    archived: {
      id: 2615477,
      name: 'Project 4',
      customer_id: 423031,
      customer_name: 'Customer 9',
      archived: true,
      budget: 0,
      budget_type: 'minutes',
      note: '',
    },
  },
  {
    tool: 'mite_list_services',
    resource: 'services',
    active: {
      id: 120258,
      name: 'Service 3',
      billable: false,
      archived: false,
      note: 'Example note',
    },
    archived: { id: 151468, name: 'Service 6', billable: true, archived: true, note: '' },
  },
  {
    tool: 'mite_list_users',
    resource: 'users',
    active: { id: 29508, name: 'User 1', role: 'owner', archived: false },
    archived: { id: 101803, name: 'User 2', role: 'time_tracker', archived: true },
  },
];

describe.each(cases)('$tool', ({ tool, resource, active, archived }) => {
  it('lists the active entries by default', async () => {
    const { result, paths } = await call(tool, resource);
    expect(result.isError).toBeFalsy();
    expect(paths).toEqual([`/${resource}.json`]);
    expect(rowsOf(result)[0]).toEqual(active);
  });

  it('lists the archived entries with archived: true', async () => {
    const { result, paths } = await call(tool, resource, { archived: true });
    expect(result.isError).toBeFalsy();
    expect(paths).toEqual([`/${resource}/archived.json`]);
    expect(rowsOf(result)[0]).toEqual(archived);
  });

  it.each([false, true])('never returns email or hourly_rate (archived: %s)', async (flag) => {
    const { result } = await call(tool, resource, { archived: flag });
    const output = JSON.stringify(result);
    expect(output).not.toContain('email');
    expect(output).not.toContain('example.com');
    expect(output).not.toContain('hourly_rate');
  });

  it('quotes names and notes as data', async () => {
    const { result } = await call(tool, resource);
    const text = (result.content as { text: string }[])[0]?.text ?? '';
    expect(text).toContain('not instructions');
    expect(text).toContain(JSON.stringify(active.name));
  });
});

describe('master data tools', () => {
  it('say so when nothing is found', async () => {
    const { fetch } = fakeFetch({ '/users.json': () => json([]) });
    const client = await connect(config(), miteClient(fetch));
    const result = await client.callTool({ name: 'mite_list_users', arguments: {} });
    expect(result.structuredContent).toEqual({ rows: [] });
    expect(result.content).toEqual([{ type: 'text', text: 'No users found.' }]);
  });

  it('respect MITE_TOOLS', async () => {
    const client = await connect(
      config({ tools: ['mite_list_projects'] }),
      miteClient(fakeFetch({}).fetch),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['mite_list_projects']);
  });
});
