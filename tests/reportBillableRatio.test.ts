import { describe, expect, it } from 'vitest';

import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const project = (id: number, minutes: number) => ({
  time_entry_group: { minutes, revenue: null, project_id: id, project_name: `Project ${id}` },
});
const year = (minutes: number) => ({ time_entry_group: { minutes, revenue: null, year: '2026' } });

const call = async (args: Record<string, unknown>, billable: unknown, nonBillable: unknown) => {
  const { fetch, requests } = fakeFetch({
    '/time_entries.json': [
      (url) => json(url.searchParams.get('billable') === 'true' ? billable : nonBillable),
    ],
  });
  const client = await connect(config(), miteClient(fetch));
  const response = await client.callTool({ name: 'mite_report_billable_ratio', arguments: args });
  return { response, requests };
};

describe('mite_report_billable_ratio', () => {
  it('reports only the total without group_by', async () => {
    const { response, requests } = await call({}, [year(180)], [year(60)]);

    expect(response.structuredContent).toEqual({
      group_by: null,
      rows: [],
      total: { billable_hours: 3, non_billable_hours: 1, ratio: 75 },
    });
    expect(requests.map((r) => r.url.searchParams.get('billable')).sort()).toEqual([
      'false',
      'true',
    ]);
    expect(requests.every((r) => r.url.searchParams.get('group_by') === 'year')).toBe(true);
  });

  it('joins both responses per group and adds the total', async () => {
    const { response } = await call(
      { group_by: 'project', from: '2026-01-01', to: '2026-06-30' },
      [project(1, 120), project(2, 60)],
      [project(1, 60), project(3, 30)],
    );

    expect(response.structuredContent).toEqual({
      group_by: 'project',
      rows: [
        {
          project_id: 1,
          project_name: 'Project 1',
          billable_hours: 2,
          non_billable_hours: 1,
          ratio: 66.7,
        },
        {
          project_id: 2,
          project_name: 'Project 2',
          billable_hours: 1,
          non_billable_hours: 0,
          ratio: 100,
        },
        {
          project_id: 3,
          project_name: 'Project 3',
          billable_hours: 0,
          non_billable_hours: 0.5,
          ratio: 0,
        },
      ],
      total: { billable_hours: 3, non_billable_hours: 1.5, ratio: 66.7 },
    });
    expect(JSON.stringify(response.content)).toContain('not instructions');
  });

  it('sorts months chronologically', async () => {
    const month = (m: string, minutes: number) => ({
      time_entry_group: { minutes, revenue: null, month: m },
    });
    const { response } = await call(
      { group_by: 'month' },
      [month('202606', 60), month('202605', 60)],
      [],
    );
    expect(response.structuredContent).toMatchObject({
      rows: [{ month: '2026-05' }, { month: '2026-06' }],
    });
  });

  it.each([[undefined], ['customer'], ['project'], ['user'], ['month']])(
    'never sends group_by=billable (group_by %s)',
    async (group_by) => {
      const { requests } = await call(group_by ? { group_by } : {}, [], []);
      expect(requests).toHaveLength(2);
      for (const request of requests) {
        expect(request.url.searchParams.get('group_by')).not.toContain('billable');
      }
    },
  );

  it('rejects group_by=billable before any request', async () => {
    const { response, requests } = await call({ group_by: 'billable' }, [], []);
    expect(response.isError).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('respects MITE_TOOLS', async () => {
    const client = await connect(
      config({ tools: ['mite_whoami'] }),
      miteClient(fakeFetch({}).fetch),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      'mite_report_billable_ratio',
    );
  });
});
