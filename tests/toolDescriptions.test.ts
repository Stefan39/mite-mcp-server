import { describe, expect, it } from 'vitest';

import { allTools } from '../src/tools/index.js';
import { config, connect, fakeFetch, miteClient } from './helpers.js';

const CHECKED_TOOLS = allTools.map((tool) => tool.name);

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
