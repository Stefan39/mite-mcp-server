import { describe, expect, it } from 'vitest';

import { periodQuery, periodValue } from '../src/tools/period.js';

describe('periodValue', () => {
  it.each(['2026-07-01', 'this_month', 'last_year'])('accepts %s', (value) => {
    expect(periodValue.safeParse(value).success).toBe(true);
  });

  it.each(['2026-13-45', '01.07.2026', 'next_month', ''])('rejects %s', (value) => {
    expect(periodValue.safeParse(value).success).toBe(false);
  });
});

describe('periodQuery', () => {
  it('defaults to this year', () => {
    expect(periodQuery({})).toEqual({ at: 'this_year' });
  });

  it('uses a keyword alone as "at"', () => {
    expect(periodQuery({ from: 'last_month' })).toEqual({ at: 'last_month' });
  });

  it('runs an open date range until today', () => {
    expect(periodQuery({ from: '2026-01-01' })).toEqual({ from: '2026-01-01', to: 'today' });
  });

  it('passes a full range through and fills a missing start', () => {
    expect(periodQuery({ from: '2026-01-01', to: '2026-06-30' })).toEqual({
      from: '2026-01-01',
      to: '2026-06-30',
    });
    expect(periodQuery({ to: '2026-06-30' })).toEqual({ from: '2026-06-30', to: '2026-06-30' });
  });
});
