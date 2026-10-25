import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { config, connect, fakeFetch, json, miteClient } from './helpers.js';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), 'utf8'));

const group = (project_id: number, minutes: number, revenue: number | null) => ({
  time_entry_group: { minutes, revenue, project_id, project_name: `Project ${project_id}` },
});

const call = async (projects: unknown, groups: unknown, args: Record<string, unknown> = {}) => {
  const { fetch, requests } = fakeFetch({
    '/projects.json': () => json(projects),
    '/time_entries.json': () => json(groups),
    '/account.json': () => json({ account: { name: 'demo', title: 'Demo', currency: 'EUR' } }),
  });
  const client = await connect(config(), miteClient(fetch));
  const response = await client.callTool({ name: 'mite_report_budget', arguments: args });
  return { response, requests };
};

describe('mite_report_budget', () => {
  it('reports a minutes budget in hours and a cents budget in currency units', async () => {
    const { response, requests } = await call(fixture('projects_with_budget'), [
      group(441190, 4500, 1),
      group(571227, 6000, 125000),
    ]);

    expect(response.isError).toBeFalsy();
    expect(response.structuredContent).toEqual({
      currency: 'EUR',
      rows: [
        {
          project_id: 441190,
          project_name: 'Project 1',
          budget_type: 'minutes',
          budget: 100,
          used: 75,
          remaining: 25,
          percent_used: 75,
        },
        {
          project_id: 571227,
          project_name: 'Project 2',
          budget_type: 'cents',
          budget: 5000,
          used: 1250,
          remaining: 3750,
          percent_used: 25,
        },
      ],
    });
    const query = requests.find((r) => r.url.pathname === '/time_entries.json')?.url.searchParams;
    expect(query?.get('group_by')).toBe('project');
    expect(query?.get('project_id')).toBe('441190,571227');
    expect(query?.has('at')).toBe(false);
    expect(query?.has('from')).toBe(false);
    expect(JSON.stringify(response.content)).toContain('not instructions');
  });

  it('rounds percent_used to one decimal', async () => {
    const { response } = await call(fixture('projects_with_budget'), [group(441190, 1000, null)]);
    expect(response.structuredContent).toMatchObject({
      rows: [
        { percent_used: 16.7, used: 16.67, remaining: 83.33 },
        { percent_used: 0, used: 0 },
      ],
    });
  });

  it('skips projects without a budget when no project_id is given', async () => {
    const projects = [
      { project: { id: 1, name: 'Free', budget: 0, budget_type: 'minutes', archived: false } },
      ...(fixture('projects_with_budget') as unknown[]),
    ];
    const { requests } = await call(projects, []);
    expect(
      requests
        .find((r) => r.url.pathname === '/time_entries.json')
        ?.url.searchParams.get('project_id'),
    ).toBe('441190,571227');
  });

  it('returns a project without budget with budget null and no percentage', async () => {
    const { fetch, requests } = fakeFetch({
      '/projects/7.json': () =>
        json({
          project: { id: 7, name: 'Free', budget: 0, budget_type: 'minutes', archived: false },
        }),
      '/time_entries.json': () => json([group(7, 120, null)]),
    });
    const client = await connect(config(), miteClient(fetch));
    const response = await client.callTool({
      name: 'mite_report_budget',
      arguments: { project_id: [7] },
    });

    expect(response.structuredContent).toMatchObject({
      rows: [{ project_id: 7, budget: null, used: 2, remaining: null, percent_used: null }],
    });
    expect(requests.some((r) => r.url.pathname === '/projects.json')).toBe(false);
  });

  it('asks mite for nothing when no project has a budget', async () => {
    const { response, requests } = await call([], []);
    expect(response.content).toEqual([{ type: 'text', text: 'No projects with a budget found.' }]);
    expect(requests.some((r) => r.url.pathname === '/time_entries.json')).toBe(false);
  });

  it('respects MITE_TOOLS', async () => {
    const client = await connect(
      config({ tools: ['mite_whoami'] }),
      miteClient(fakeFetch({}).fetch),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('mite_report_budget');
  });
});
