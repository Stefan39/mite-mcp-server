import { describe, expect, it } from 'vitest';

import { ConfirmationTokens } from '../src/confirm.js';
import { allTools } from '../src/tools/index.js';
import { config, connect, fakeFetch, json, miteClient, type ElicitAnswer } from './helpers.js';

const ENTRY = {
  id: 5,
  date_at: '2026-01-05',
  minutes: 60,
  note: 'x',
  locked: true,
  project_id: 1,
  service_id: 2,
  user_id: 3,
  billable: true,
};

const setup = async (answer?: ElicitAnswer) => {
  const { fetch, requests } = fakeFetch({
    '/time_entries/5.json': () => json({ time_entry: ENTRY }),
    '/customers/5.json': () => json({ customer: { id: 5, name: 'Acme' } }),
  });
  const asked: string[] = [];
  const client = await connect(
    config({ mode: 'admin' }),
    miteClient(fetch),
    allTools,
    new ConfirmationTokens(),
    answer === undefined
      ? undefined
      : (message) => {
          asked.push(message);
          return answer(message);
        },
  );
  const writes = () => requests.filter((r) => r.method !== 'GET');
  const token = async (name: string, args: Record<string, unknown>): Promise<string> =>
    (
      (await client.callTool({ name, arguments: args })).structuredContent as {
        confirm_token: string;
      }
    ).confirm_token;
  return { client, asked, writes, token };
};

const cases = [
  { name: 'mite_delete_time_entry', args: { id: 5, force: true }, method: 'DELETE' },
  { name: 'mite_delete_customer', args: { id: 5 }, method: 'DELETE' },
  { name: 'mite_update_time_entry', args: { id: 5, hours: 2, force: true }, method: 'PATCH' },
];

describe.each(cases)('elicitation for $name', ({ name, args, method }) => {
  it('executes exactly one request after accept', async () => {
    const { client, asked, writes, token } = await setup(() => 'accept');
    const confirm_token = await token(name, args);
    const result = await client.callTool({ name, arguments: { ...args, confirm_token } });
    expect(result.isError).toBeFalsy();
    expect(asked).toHaveLength(1);
    expect(writes().map((r) => r.method)).toEqual([method]);
  });

  it.each(['decline', 'cancel'] as const)('sends nothing after %s', async (action) => {
    const { client, asked, writes, token } = await setup(() => action);
    const confirm_token = await token(name, args);
    const result = await client.callTool({ name, arguments: { ...args, confirm_token } });
    expect(result.isError).toBe(true);
    expect(asked).toHaveLength(1);
    expect(writes()).toHaveLength(0);
  });

  it('keeps the token usable after a decline', async () => {
    let action: 'decline' | 'accept' = 'decline';
    const { client, writes, token } = await setup(() => action);
    const confirm_token = await token(name, args);
    await client.callTool({ name, arguments: { ...args, confirm_token } });
    action = 'accept';
    const result = await client.callTool({ name, arguments: { ...args, confirm_token } });
    expect(result.isError).toBeFalsy();
    expect(writes()).toHaveLength(1);
  });

  it('does not ask for an invalid token', async () => {
    const { client, asked, writes } = await setup(() => 'accept');
    const result = await client.callTool({
      name,
      arguments: { ...args, confirm_token: '1.abc' },
    });
    expect(result.isError).toBe(true);
    expect(asked).toHaveLength(0);
    expect(writes()).toHaveLength(0);
  });

  it('does not ask on the preview call', async () => {
    const { asked, token } = await setup(() => 'accept');
    await token(name, args);
    expect(asked).toHaveLength(0);
  });

  it('works with the token alone if the client has no elicitation', async () => {
    const { client, writes, token } = await setup();
    const confirm_token = await token(name, args);
    const result = await client.callTool({ name, arguments: { ...args, confirm_token } });
    expect(result.isError).toBeFalsy();
    expect(writes().map((r) => r.method)).toEqual([method]);
  });
});
