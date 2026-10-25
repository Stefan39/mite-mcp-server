import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineTool, type ToolDefinition } from '../src/tools/definition.js';
import { allTools } from '../src/tools/index.js';
import { API_KEY, config, connect, fakeFetch, json, miteClient } from './helpers.js';

const account = { account: { id: 1, name: 'demo', title: 'Demo GmbH', currency: 'EUR' } };
const myself = { user: { id: 7, name: 'Stefan', role: 'admin', email: 'x@example.com' } };

const writeTool = defineTool({
  name: 'mite_delete_everything',
  title: 'test only',
  description: 'test only',
  mode: 'write',
  annotations: { destructiveHint: true },
  inputSchema: z.object({}),
  handler: () => Promise.resolve({ content: [] }),
}) as unknown as ToolDefinition;

const toolNames = async (cfg = config(), tools = [...allTools, writeTool]): Promise<string[]> => {
  const client = await connect(cfg, miteClient(fakeFetch({}).fetch), tools);
  return (await client.listTools()).tools.map((tool) => tool.name).sort();
};

describe('tool registration', () => {
  it('registers no write tool in read-only mode', async () => {
    expect(await toolNames()).toEqual([
      'mite_get_time_entry',
      'mite_list_time_entries',
      'mite_report_projects_by_month',
      'mite_tracker_status',
      'mite_whoami',
    ]);
  });

  it('offers write tools only in write mode', async () => {
    expect(await toolNames(config({ mode: 'write' }))).toContain('mite_delete_everything');
  });

  it('honours the allowlist', async () => {
    expect(await toolNames(config({ tools: ['mite_whoami'] }))).toEqual(['mite_whoami']);
  });

  it('marks read tools as read-only for clients', async () => {
    const client = await connect(config(), miteClient(fakeFetch({}).fetch));
    const { tools } = await client.listTools();
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });
});

describe('mite_whoami', () => {
  it('shows account, user, role and the server mode without the email', async () => {
    const { fetch } = fakeFetch({
      '/account.json': () => json(account),
      '/myself.json': () => json(myself),
    });
    const client = await connect(config(), miteClient(fetch));
    const result = await client.callTool({ name: 'mite_whoami', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      account: { name: 'demo', title: 'Demo GmbH', currency: 'EUR' },
      user: { id: 7, name: 'Stefan', role: 'admin' },
      server: {
        mode: 'read-only',
        tools: [
          'mite_whoami',
          'mite_report_projects_by_month',
          'mite_list_time_entries',
          'mite_get_time_entry',
          'mite_tracker_status',
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain('x@example.com');
  });
});

describe('mite_report_projects_by_month', () => {
  const groups = [
    {
      time_entry_group: {
        minutes: 600,
        time_entries_params: { from: '2026-07-01', to: '2026-07-31', project_id: '3' },
        revenue: 75000,
        project_id: 3,
        project_name: 'Website',
        month: '202607',
      },
    },
  ];

  it('asks mite to group on the server and returns the report', async () => {
    const { fetch, requests } = fakeFetch({
      '/time_entries.json': () => json(groups),
      '/account.json': () => json(account),
    });
    const client = await connect(config(), miteClient(fetch));
    const result = await client.callTool({
      name: 'mite_report_projects_by_month',
      arguments: { from: '2026-07-01', to: '2026-07-31', project_id: [3], billable: true },
    });

    const query = requests.find((r) => r.url.pathname === '/time_entries.json')?.url.searchParams;
    expect(query?.get('group_by')).toBe('project,month');
    expect(query?.get('from')).toBe('2026-07-01');
    expect(query?.get('to')).toBe('2026-07-31');
    expect(query?.get('project_id')).toBe('3');
    expect(query?.get('billable')).toBe('true');
    expect(result.structuredContent).toEqual({
      currency: 'EUR',
      rows: [{ month: '2026-07', project_id: 3, project_name: 'Website', hours: 10, revenue: 750 }],
      total: { hours: 10, revenue: 750 },
    });
  });

  it('still reports when the account (currency) is not readable', async () => {
    const { fetch } = fakeFetch({
      '/time_entries.json': () => json(groups),
      '/account.json': () => json({ error: 'forbidden' }, 403),
    });
    const client = await connect(config(), miteClient(fetch));
    const result = await client.callTool({ name: 'mite_report_projects_by_month', arguments: {} });
    expect(result.structuredContent).toMatchObject({ currency: null, total: { hours: 10 } });
  });

  it('rejects an invalid date before calling mite', async () => {
    const { fetch, requests } = fakeFetch({});
    const client = await connect(config(), miteClient(fetch));
    const result = await client.callTool({
      name: 'mite_report_projects_by_month',
      arguments: { from: '31.07.2026' },
    });
    expect(result.isError).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('turns mite errors into a tool error without the key', async () => {
    const { fetch } = fakeFetch({
      '/time_entries.json': () => json({ error: `bad key ${API_KEY}` }, 401),
      '/account.json': () => json(account),
    });
    const client = await connect(config(), miteClient(fetch));
    const result = await client.callTool({ name: 'mite_report_projects_by_month', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('401');
    expect(JSON.stringify(result.content)).not.toContain(API_KEY);
  });
});
