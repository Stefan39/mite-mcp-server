import { describe, expect, it } from 'vitest';

import { redact } from '../src/redact.js';

describe('redact', () => {
  it('replaces every occurrence of a secret', () => {
    expect(redact('a abcdef b abcdef', ['abcdef'])).toBe('a [redacted] b [redacted]');
  });

  it('ignores secrets too short to be meaningful', () => {
    expect(redact('abc', ['', 'ab'])).toBe('abc');
  });
});
