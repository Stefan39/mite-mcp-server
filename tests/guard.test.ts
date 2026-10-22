import { describe, expect, it } from 'vitest';

import type { Mode } from '../src/config.js';
import { selectTools, unknownAllowlistEntries } from '../src/guard.js';
import { config } from './helpers.js';

const tools: { name: string; mode: Mode }[] = [
  { name: 'read', mode: 'read-only' },
  { name: 'write', mode: 'write' },
  { name: 'admin', mode: 'admin' },
];

const names = (list: { name: string }[]): string[] => list.map((tool) => tool.name);

describe('selectTools', () => {
  it.each([
    ['read-only', ['read']],
    ['write', ['read', 'write']],
    ['admin', ['read', 'write', 'admin']],
  ] as const)('mode %s offers %j', (mode, expected) => {
    expect(names(selectTools(tools, config({ mode })))).toEqual(expected);
  });

  it('narrows further with an allowlist', () => {
    expect(names(selectTools(tools, config({ mode: 'admin', tools: ['write'] })))).toEqual([
      'write',
    ]);
  });

  it('never widens the mode through the allowlist', () => {
    expect(names(selectTools(tools, config({ tools: ['write', 'admin'] })))).toEqual([]);
  });
});

describe('unknownAllowlistEntries', () => {
  it('reports names that match no tool', () => {
    expect(unknownAllowlistEntries(tools, config({ tools: ['read', 'raed'] }))).toEqual(['raed']);
    expect(unknownAllowlistEntries(tools, config())).toEqual([]);
  });
});
