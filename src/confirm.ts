import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** How long a confirmation token stays valid. */
export const TOKEN_TTL_MS = 5 * 60 * 1000;

/** Arguments that do not belong to the action itself and are left out of the token. */
const CONTROL_ARGUMENTS = ['confirm_token', 'dry_run'];

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, canonicalise(inner)]),
    );
  }
  return value;
}

/**
 * Short-lived, single-use tokens for destructive tools. A token is bound to the
 * tool name and the arguments (sorted keys, without `confirm_token` and `dry_run`),
 * so it cannot be reused for another action. The key lives in memory for this
 * process only, so tokens do not survive a restart.
 */
export class ConfirmationTokens {
  private readonly used = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly key: Buffer = randomBytes(32),
  ) {}

  issue(tool: string, args: Record<string, unknown>): string {
    const expiresAt = this.now() + TOKEN_TTL_MS;
    return `${expiresAt}.${this.sign(tool, args, expiresAt)}`;
  }

  /** True exactly once for a valid, unexpired token issued for this tool and these arguments. */
  consume(tool: string, args: Record<string, unknown>, token: string): boolean {
    const signature = this.verify(tool, args, token);
    if (signature === undefined) return false;
    this.used.set(signature, Number(token.split('.')[0]));
    return true;
  }

  /** Like {@link consume}, but leaves the token unused, e.g. while the human is still being asked. */
  check(tool: string, args: Record<string, unknown>, token: string): boolean {
    return this.verify(tool, args, token) !== undefined;
  }

  private verify(tool: string, args: Record<string, unknown>, token: string): string | undefined {
    this.prune();
    const [expiry, signature, ...rest] = token.split('.');
    const expiresAt = Number(expiry);
    if (signature === undefined || rest.length > 0 || !Number.isSafeInteger(expiresAt)) {
      return undefined;
    }
    if (expiresAt <= this.now() || this.used.has(signature)) {
      return undefined;
    }
    const expected = Buffer.from(this.sign(tool, args, expiresAt));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      return undefined;
    }
    return signature;
  }

  private sign(tool: string, args: Record<string, unknown>, expiresAt: number): string {
    const rest = Object.fromEntries(
      Object.entries(args).filter(([name]) => !CONTROL_ARGUMENTS.includes(name)),
    );
    return createHmac('sha256', this.key)
      .update(JSON.stringify([tool, canonicalise(rest), expiresAt]))
      .digest('hex');
  }

  private prune(): void {
    const now = this.now();
    for (const [signature, expiresAt] of this.used) {
      if (expiresAt <= now) this.used.delete(signature);
    }
  }
}
