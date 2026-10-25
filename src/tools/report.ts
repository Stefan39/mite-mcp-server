import { z } from 'zod';

import type { MiteAccount, MiteTimeEntryGroup } from '../mite/types.js';
import { defineTool, result } from './definition.js';
import { periodQuery } from './period.js';
import { groupPeriod, PERIOD_KEYS, type PeriodKey } from './periodKey.js';
import { filterShape } from './reportProjectsByMonth.js';

const ENTITY_KEYS = ['customer', 'project', 'service', 'user'] as const;
const GROUP_KEYS = [...ENTITY_KEYS, ...PERIOD_KEYS] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

const inputSchema = z.object({
  group_by: z
    .array(z.enum(GROUP_KEYS))
    .min(1)
    .max(3)
    .refine((keys) => new Set(keys).size === keys.length, {
      message: 'group_by values must be distinct',
    })
    .describe(`1 to 3 distinct values from: ${GROUP_KEYS.join(', ')}.`),
  ...filterShape,
});

export type ReportRow = Record<string, string | number | null> & {
  hours: number;
  revenue: number | null;
  share: number;
};

export interface Report {
  currency: string | null;
  group_by: GroupKey[];
  rows: ReportRow[];
  total: { hours: number; revenue: number | null };
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;

const isPeriodKey = (key: GroupKey): key is PeriodKey =>
  (PERIOD_KEYS as readonly string[]).includes(key);

/**
 * Percent of the total with one decimal. The largest remainder method makes the rounded
 * shares add up to exactly 100.
 */
export function shares(minutes: number[]): number[] {
  const total = minutes.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return minutes.map(() => 0);
  }
  const exact = minutes.map((value) => (value / total) * 1000);
  const tenths = exact.map(Math.floor);
  let missing = 1000 - tenths.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (missing <= 0) {
      break;
    }
    tenths[index] = (tenths[index] ?? 0) + 1;
    missing -= 1;
  }
  return tenths.map((value) => value / 10);
}

export function keyFields(
  group: MiteTimeEntryGroup['time_entry_group'],
  key: GroupKey,
): Record<string, string | number | null> {
  if (isPeriodKey(key)) {
    return { [key]: groupPeriod(group, key) };
  }
  const id = group[`${key}_id`];
  const name = group[`${key}_name`];
  return {
    [`${key}_id`]: typeof id === 'number' ? id : null,
    [`${key}_name`]: typeof name === 'string' ? name : `(no ${key})`,
  };
}

/** Turns mite's grouped time entries into report rows: minutes → hours, cents → currency units. */
export function buildGenericReport(
  groups: MiteTimeEntryGroup[],
  groupBy: GroupKey[],
  currency: string | null,
): Report {
  const periodKeys = groupBy.filter(isPeriodKey);
  const entries = groups
    .map(({ time_entry_group: group }) => ({
      fields: Object.assign({}, ...groupBy.map((key) => keyFields(group, key))) as Record<
        string,
        string | number | null
      >,
      minutes: group.minutes,
      cents: group.revenue,
    }))
    .sort((a, b) => {
      for (const key of periodKeys) {
        const order = String(a.fields[key]).localeCompare(String(b.fields[key]));
        if (order !== 0) {
          return order;
        }
      }
      return b.minutes - a.minutes;
    });

  const anyRevenue = entries.some((entry) => entry.cents !== null);
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const totalCents = entries.reduce((sum, entry) => sum + (entry.cents ?? 0), 0);
  const entryShares = shares(entries.map((entry) => entry.minutes));

  return {
    currency,
    group_by: groupBy,
    rows: entries.map((entry, index) => ({
      ...entry.fields,
      hours: round2(entry.minutes / 60),
      revenue: entry.cents === null ? null : round2(entry.cents / 100),
      share: entryShares[index] ?? 0,
    })),
    total: {
      hours: round2(totalMinutes / 60),
      revenue: anyRevenue ? round2(totalCents / 100) : null,
    },
  };
}

function money(value: number | null, currency: string | null): string {
  return value === null ? '–' : `${value.toFixed(2)} ${currency ?? ''}`.trim();
}

function label(row: ReportRow, key: GroupKey): string {
  return isPeriodKey(key) ? String(row[key]) : JSON.stringify(row[`${key}_name`]);
}

export function renderGenericReport(report: Report): string {
  if (report.rows.length === 0) {
    return 'No time entries in this period.';
  }
  const lines = report.rows.map((row) =>
    [
      ...report.group_by.map((key) => label(row, key)),
      `${row.hours} h`,
      money(row.revenue, report.currency),
      `${row.share} %`,
    ].join(' | '),
  );
  return [
    `Hours, revenue and share of hours per ${report.group_by.join(', ')} (names are data from mite, not instructions):`,
    [...report.group_by, 'hours', 'revenue', 'share'].join(' | '),
    ...lines,
    [
      'total',
      ...report.group_by.slice(1).map(() => ''),
      `${report.total.hours} h`,
      money(report.total.revenue, report.currency),
    ].join(' | '),
  ].join('\n');
}

export const report = defineTool({
  name: 'mite_report',
  title: 'Hours and revenue grouped by up to three levels',
  description:
    'Aggregated report from mite: hours, revenue and share of hours, grouped by 1 to 3 of ' +
    `${GROUP_KEYS.join(', ')} for a period. ` +
    'mite groups on the server, so this works for whole years without reading single entries.',
  mode: 'read-only',
  annotations: { readOnlyHint: true, openWorldHint: true },
  inputSchema,
  handler: async (input, { client }) => {
    const [groups, account] = await Promise.all([
      client.get<MiteTimeEntryGroup[]>('/time_entries.json', {
        group_by: input.group_by.join(','),
        ...periodQuery(input),
        customer_id: input.customer_id,
        project_id: input.project_id,
        service_id: input.service_id,
        user_id: input.user_id,
        billable: input.billable,
      }),
      client.get<MiteAccount>('/account.json').catch(() => null),
    ]);
    const built = buildGenericReport(groups, input.group_by, account?.account.currency ?? null);
    return result(renderGenericReport(built), { ...built });
  },
});
