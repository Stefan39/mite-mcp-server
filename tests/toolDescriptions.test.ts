import { describe, expect, it } from 'vitest';

import { config, connect, fakeFetch, miteClient } from './helpers.js';

const CHECKED_TOOLS = [
  'mite_whoami',
  'mite_report_projects_by_month',
  'mite_report',
  'mite_report_budget',
  'mite_report_billable_ratio',
  'mite_list_time_entries',
  'mite_get_time_entry',
  'mite_tracker_status',
  'mite_list_customers',
  'mite_list_projects',
  'mite_list_services',
  'mite_list_users',
];

describe('tool descriptions', () => {
  it('describes every checked tool and each of its parameters', async () => {
    const client = await connect(config({ mode: 'admin' }), miteClient(fakeFetch({}).fetch));
    const tools = (await client.listTools()).tools;
    const checked = tools.filter((tool) => CHECKED_TOOLS.includes(tool.name));
    expect(checked.map((tool) => tool.name).sort()).toEqual([...CHECKED_TOOLS].sort());

    for (const tool of checked) {
      expect(tool.description?.length ?? 0, tool.name).toBeGreaterThanOrEqual(120);
      const properties = (tool.inputSchema.properties ?? {}) as Record<
        string,
        { description?: string }
      >;
      for (const [name, schema] of Object.entries(properties)) {
        expect(schema.description?.trim(), `${tool.name}.${name}`).toBeTruthy();
      }
    }
  });
});
