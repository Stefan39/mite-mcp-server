import { MiteApiError } from '../errors.js';
import { redact } from '../redact.js';

export type QueryValue = string | number | boolean | readonly (string | number)[] | undefined;
export type Query = Record<string, QueryValue>;

export interface MiteClientOptions {
  account: string;
  apiKey: string;
  userAgent: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Minimum gap between two requests. mite documents no rate limit, so stay polite. */
  minIntervalMs?: number;
  maxAttempts?: number;
  timeoutMs?: number;
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class MiteClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;
  private lastRequestAt = 0;

  constructor(private readonly options: MiteClientOptions) {
    this.baseUrl = `https://${options.account}.mite.de`;
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.minIntervalMs = options.minIntervalMs ?? 250;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async get<T>(path: string, query: Query = {}): Promise<T> {
    const response = await this.request('GET', this.buildUrl(path, query));
    return (await response.json()) as T;
  }

  /** Deletes a resource. mite answers with an empty body, so nothing is returned. */
  async delete(path: string): Promise<void> {
    await this.request('DELETE', this.buildUrl(path, {}));
  }

  private async request(method: 'GET' | 'DELETE', url: URL): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      await this.throttle();
      const response = await this.send(method, url);
      if (response.ok) {
        return response;
      }
      if (!RETRYABLE.has(response.status) || attempt >= this.maxAttempts) {
        throw await this.toError(response);
      }
      await this.sleep(this.retryDelay(response, attempt));
    }
  }

  private buildUrl(path: string, query: Query): URL {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    return url;
  }

  private async send(method: string, url: URL): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        method,
        headers: {
          'X-MiteApiKey': this.options.apiKey,
          'User-Agent': this.options.userAgent,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new MiteApiError(this.clean(`mite is not reachable: ${reason}`), 0);
    }
  }

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) {
      await this.sleep(wait);
    }
    this.lastRequestAt = Date.now();
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get('Retry-After'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return Math.min(retryAfter, 30) * 1000;
    }
    return 500 * 2 ** (attempt - 1);
  }

  private async toError(response: Response): Promise<MiteApiError> {
    let detail = '';
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body.error === 'string') {
        detail = `: ${body.error}`;
      }
    } catch {
      // Body is not JSON; the status code alone has to do.
    }
    const hint =
      response.status === 401
        ? ' (check MITE_ACCOUNT and MITE_API_KEY, and that API access is enabled in mite)'
        : '';
    return new MiteApiError(
      this.clean(`mite API answered ${response.status}${detail}${hint}`),
      response.status,
    );
  }

  private clean(message: string): string {
    return redact(message, [this.options.apiKey]);
  }
}
