import type { MiteTimeEntryGroup } from '../mite/types.js';

export const PERIOD_KEYS = ['day', 'week', 'month', 'year'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

type Group = MiteTimeEntryGroup['time_entry_group'];

/** ISO 8601 week of a YYYY-MM-DD date as `YYYY-Www`, or null for anything else. */
function isoWeek(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
    return null;
  }
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) {
    return null;
  }
  // The Thursday of a week decides which year the week belongs to.
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Period of a group as a readable string. mite sends the period under the key's own name:
 * `day` "YYYY-MM-DD", `week` "YYYYWW", `month` "YYYYMM", `year` "YYYY". Older shapes only
 * carry a start date, which is used as a fallback.
 */
export function groupPeriod(group: Group, key: PeriodKey): string {
  const value = group[key];
  if (typeof value === 'string') {
    if (key === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    if (key === 'week' && /^\d{6}$/.test(value)) {
      return `${value.slice(0, 4)}-W${value.slice(4)}`;
    }
    if (key === 'month' && /^\d{6}$/.test(value)) {
      return `${value.slice(0, 4)}-${value.slice(4)}`;
    }
    if (key === 'year' && /^\d{4}$/.test(value)) {
      return value;
    }
  }
  const params = group.time_entries_params;
  const start = params?.from ?? (key === 'day' ? params?.at : undefined) ?? group.from;
  if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start)) {
    switch (key) {
      case 'day':
        return start.slice(0, 10);
      case 'week':
        return isoWeek(start) ?? 'unknown';
      case 'month':
        return start.slice(0, 7);
      case 'year':
        return start.slice(0, 4);
    }
  }
  return 'unknown';
}
