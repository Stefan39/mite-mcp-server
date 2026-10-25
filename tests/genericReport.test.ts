import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import type { MiteTimeEntryGroup } from '../src/mite/types.js';
import { groupPeriod } from '../src/tools/periodKey.js';
import { buildGenericReport, shares } from '../src/tools/report.js';
import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const fixture = (name: string): MiteTimeEntryGroup[] =>
  JSON.parse(
    readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'),
  ) as MiteTimeEntryGroup[];

const shareSum = (rows: { share: number }[]): number => rows.reduce((sum, r) => sum + r.share, 0);

const call = async (name: string, group_by: string[]) => {
  const { fetch, requests } = fakeFetch({
    '/time_entries.json': () => json(fixture(name)),
    '/account.json': () => json({ account: { name: 'demo', title: 'Demo', currency: 'EUR' } }),
  });
  const client = await connect(config(), miteClient(fetch));
  const response = await client.callTool({ name: 'mite_report', arguments: { group_by } });
  return { response, requests };
};

describe('mite_report', () => {
  it.each([
    [
      'grp_day',
      ['day'],
      [
        { day: '2026-09-16', hours: 1 },
        { day: '2026-09-18', hours: 0.17 },
      ],
    ],
    [
      'grp_week',
      ['week'],
      [
        { week: '2026-W37', hours: 0.83 },
        { week: '2026-W38', hours: 1.5 },
      ],
    ],
    [
      'grp_month',
      ['month'],
      [
        { month: '2026-06', hours: 73.25, revenue: 7325 },
        { month: '2026-09', hours: 2.33 },
      ],
    ],
    ['grp_year', ['year'], [{ year: '2026', hours: 672.08, revenue: 67208.33, share: 100 }]],
    [
      'grp_customer',
      ['customer'],
      [
        { customer_id: 890048, customer_name: 'Customer 3' },
        { customer_id: 115591, customer_name: 'Customer 7' },
      ],
    ],
    [
      'grp_project',
      ['project'],
      [
        { project_id: 4548962, project_name: 'Project 1' },
        { project_id: 4811858, project_name: 'Project 2' },
      ],
    ],
    [
      'grp_service',
      ['service'],
      [
        { service_id: 471169, service_name: 'Service 1' },
        { service_id: 120244, service_name: 'Service 2' },
      ],
    ],
    ['grp_user', ['user'], [{ user_id: 29508, user_name: 'User 1', share: 100 }]],
    [
      'grp_customer_project_month',
      ['customer', 'project', 'month'],
      [
        {
          customer_name: 'Customer 3',
          project_name: 'Project 1',
          month: '2026-05',
          hours: 147.75,
          revenue: 14775,
        },
        {
          customer_name: 'Customer 3',
          project_name: 'Project 1',
          month: '2026-06',
          hours: 73.25,
          revenue: 7325,
        },
      ],
    ],
  ])('%s: reads %j', async (name, groupBy, expected) => {
    const { response, requests } = await call(name, groupBy);
    const data = response.structuredContent as { rows: { share: number }[]; group_by: string[] };

    expect(response.isError).toBeFalsy();
    expect(
      requests
        .find((r) => r.url.pathname === '/time_entries.json')
        ?.url.searchParams.get('group_by'),
    ).toBe(groupBy.join(','));
    expect(data.group_by).toEqual(groupBy);
    expect(data.rows).toMatchObject(expected);
    expect(Math.abs(shareSum(data.rows) - 100)).toBeLessThanOrEqual(0.1);
  });

  it('reports total, currency and share', async () => {
    const { response } = await call('grp_month', ['month']);
    expect(response.structuredContent).toMatchObject({
      currency: 'EUR',
      total: { hours: 75.58, revenue: 7325 },
      rows: [
        { month: '2026-06', share: 96.9 },
        { month: '2026-09', share: 3.1 },
      ],
    });
    expect(JSON.stringify(response.content)).toContain('not instructions');
  });

  it('passes the filters on to mite', async () => {
    const { fetch, requests } = fakeFetch({ '/time_entries.json': () => json([]) });
    const client = await connect(config(), miteClient(fetch));
    const response = await client.callTool({
      name: 'mite_report',
      arguments: { group_by: ['user'], from: '2026-07-01', to: '2026-07-31', billable: true },
    });
    const query = requests.find((r) => r.url.pathname === '/time_entries.json')?.url.searchParams;
    expect(query?.get('from')).toBe('2026-07-01');
    expect(query?.get('billable')).toBe('true');
    expect(response.content).toEqual([{ type: 'text', text: 'No time entries in this period.' }]);
  });

  it.each([
    [['hour']],
    [['project', 'project']],
    [[]],
    [['customer', 'project', 'service', 'user']],
  ])('rejects group_by %j before any request', async (group_by) => {
    const { fetch, requests } = fakeFetch({ '/time_entries.json': () => json([]) });
    const client = await connect(config(), miteClient(fetch));
    const response = await client.callTool({ name: 'mite_report', arguments: { group_by } });
    expect(response.isError).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it('respects MITE_TOOLS', async () => {
    const client = await connect(
      config({ tools: ['mite_whoami'] }),
      miteClient(fakeFetch({}).fetch),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('mite_report');
  });
});

describe('buildGenericReport', () => {
  it('names missing entities and keeps revenue null', () => {
    const report = buildGenericReport(
      [{ time_entry_group: { minutes: 60, revenue: null, project_id: null, project_name: null } }],
      ['project'],
      null,
    );
    expect(report.rows).toEqual([
      { project_id: null, project_name: '(no project)', hours: 1, revenue: null, share: 100 },
    ]);
    expect(report.total.revenue).toBeNull();
  });
});

describe('shares', () => {
  it('adds up to exactly 100 even when rounding would not', () => {
    const values = shares([1, 1, 1, 1, 1, 1, 1]);
    expect(Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10).toBe(100);
  });

  it('is 0 for an empty total', () => {
    expect(shares([0, 0])).toEqual([0, 0]);
  });
});

describe('groupPeriod', () => {
  const base = { minutes: 60, revenue: null };

  it('reads the keys mite sends', () => {
    expect(groupPeriod({ ...base, day: '2026-09-18' }, 'day')).toBe('2026-09-18');
    expect(groupPeriod({ ...base, week: '202638' }, 'week')).toBe('2026-W38');
    expect(groupPeriod({ ...base, month: '202609' }, 'month')).toBe('2026-09');
    expect(groupPeriod({ ...base, year: '2026' }, 'year')).toBe('2026');
  });

  it('falls back to the start of the group', () => {
    const params = (from: string) => ({ ...base, time_entries_params: { from } });
    expect(groupPeriod(params('2026-09-14'), 'day')).toBe('2026-09-14');
    expect(groupPeriod(params('2026-09-14'), 'week')).toBe('2026-W38');
    expect(groupPeriod(params('2027-01-01'), 'week')).toBe('2026-W53');
    expect(groupPeriod(params('2026-09-14'), 'month')).toBe('2026-09');
    expect(groupPeriod(params('2026-09-14'), 'year')).toBe('2026');
    expect(groupPeriod({ ...base, time_entries_params: { at: '2026-09-18' } }, 'day')).toBe(
      '2026-09-18',
    );
  });

  it('never throws on an unexpected shape', () => {
    expect(groupPeriod({ ...base, week: 'x' }, 'week')).toBe('unknown');
    expect(groupPeriod(base, 'year')).toBe('unknown');
  });
});
