import { describe, expect, it } from 'vitest';

import { MiteApiError } from '../src/errors.js';
import { MiteClient } from '../src/mite/client.js';
import { API_KEY, fakeFetch, json, miteClient } from './helpers.js';

describe('MiteClient', () => {
  it('sends key, user agent and query to the account host', async () => {
    const { fetch, requests } = fakeFetch({ '/time_entries.json': () => json([]) });
    await miteClient(fetch).get('/time_entries.json', {
      group_by: 'project,month',
      project_id: [1, 2],
      billable: true,
      user_id: undefined,
    });

    const [request] = requests;
    expect(request?.url.host).toBe('demo.mite.de');
    expect(request?.url.searchParams.get('group_by')).toBe('project,month');
    expect(request?.url.searchParams.get('project_id')).toBe('1,2');
    expect(request?.url.searchParams.get('billable')).toBe('true');
    expect(request?.url.searchParams.has('user_id')).toBe(false);
    expect(request?.url.searchParams.has('api_key')).toBe(false);
    expect(request?.headers['X-MiteApiKey']).toBe(API_KEY);
    expect(request?.headers['User-Agent']).toBe('test-agent');
  });

  it('retries 429 and 5xx, then succeeds', async () => {
    const { fetch, requests } = fakeFetch({
      '/account.json': [
        () => json({}, 429, { 'Retry-After': '1' }),
        () => json({}, 503),
        () => json({ ok: true }),
      ],
    });
    await expect(miteClient(fetch).get('/account.json')).resolves.toEqual({ ok: true });
    expect(requests).toHaveLength(3);
  });

  it('gives up after the last attempt', async () => {
    const { fetch, requests } = fakeFetch({ '/account.json': () => json({}, 500) });
    await expect(miteClient(fetch).get('/account.json')).rejects.toMatchObject({ status: 500 });
    expect(requests).toHaveLength(3);
  });

  it('does not retry client errors and explains 401', async () => {
    const { fetch, requests } = fakeFetch({
      '/account.json': () => json({ error: 'Access denied.' }, 401),
    });
    const error = await miteClient(fetch)
      .get('/account.json')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MiteApiError);
    expect((error as Error).message).toContain('401: Access denied.');
    expect((error as Error).message).toContain('MITE_API_KEY');
    expect(requests).toHaveLength(1);
  });

  it('copes with a non-JSON error body', async () => {
    const { fetch } = fakeFetch({ '/x.json': () => new Response('<html>', { status: 404 }) });
    await expect(miteClient(fetch).get('/x.json')).rejects.toThrow('mite API answered 404');
  });

  it('never leaks the key, even when the network error contains it', async () => {
    const failing = (() => Promise.reject(new Error(`boom ${API_KEY}`))) as typeof fetch;
    const error = await miteClient(failing)
      .get('/account.json')
      .catch((e: unknown) => e);
    expect((error as Error).message).toContain('mite is not reachable');
    expect((error as Error).message).not.toContain(API_KEY);
  });

  it('waits between requests', async () => {
    const waits: number[] = [];
    const { fetch } = fakeFetch({ '/a.json': () => json({}) });
    const client = new MiteClient({
      account: 'demo',
      apiKey: API_KEY,
      userAgent: 'ua',
      fetch,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
      minIntervalMs: 10_000,
    });
    await client.get('/a.json');
    await client.get('/a.json');
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThan(9_000);
  });
});
