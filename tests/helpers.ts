import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';

import type { Config } from '../src/config.js';
import type { ConfirmationTokens } from '../src/confirm.js';
import { MiteClient } from '../src/mite/client.js';
import { createServer } from '../src/server.js';
import type { ToolDefinition } from '../src/tools/definition.js';

export const API_KEY = 'secret-api-key-1234';

export function config(overrides: Partial<Config> = {}): Config {
  return { account: 'demo', apiKey: API_KEY, mode: 'read-only', tools: undefined, ...overrides };
}

export interface FakeRequest {
  url: URL;
  method: string;
  body?: unknown;
  headers: Record<string, string>;
}

export type Route = (url: URL) => Response;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A fetch replacement that answers from a route table and records every request. */
export function fakeFetch(routes: Record<string, Route | Route[]>): {
  fetch: typeof fetch;
  requests: FakeRequest[];
} {
  const requests: FakeRequest[] = [];
  const queues = new Map(
    Object.entries(routes).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]),
  );
  const fetchFn = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: { ...(init?.headers as Record<string, string>) },
    });
    const route = queues.get(url.pathname);
    if (route === undefined) {
      return Promise.resolve(json({ error: 'not found' }, 404));
    }
    const handler = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route;
    if (handler === undefined) {
      throw new Error(`no response left for ${url.pathname}`);
    }
    return Promise.resolve(handler(url));
  };
  return { fetch: fetchFn, requests };
}

export function miteClient(fetchFn: typeof fetch): MiteClient {
  return new MiteClient({
    account: 'demo',
    apiKey: API_KEY,
    userAgent: 'test-agent',
    fetch: fetchFn,
    sleep: () => Promise.resolve(),
    minIntervalMs: 0,
  });
}

/** How a mocked client answers an elicitation request; giving one makes it announce the capability. */
export type ElicitAnswer = (message: string) => 'accept' | 'decline' | 'cancel';

export async function connect(
  cfg: Config,
  client: MiteClient,
  tools?: readonly ToolDefinition[],
  confirmations?: ConfirmationTokens,
  answer?: ElicitAnswer,
): Promise<Client> {
  const server = createServer(cfg, client, tools, confirmations);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new Client(
    { name: 'test', version: '0.0.0' },
    answer === undefined ? undefined : { capabilities: { elicitation: { form: {} } } },
  );
  if (answer !== undefined) {
    mcpClient.setRequestHandler('elicitation/create', (request) => ({
      action: answer(request.params.message),
    }));
  }
  await mcpClient.connect(clientTransport);
  return mcpClient;
}
