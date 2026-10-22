import { ConfigError } from './errors.js';

export const MODES = ['read-only', 'write', 'admin'] as const;
export type Mode = (typeof MODES)[number];

export interface Config {
  /** mite account name, i.e. the subdomain of `https://<account>.mite.de`. */
  account: string;
  apiKey: string;
  mode: Mode;
  /** Tool allowlist. `undefined` means: every tool the mode permits. */
  tools: readonly string[] | undefined;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Environment variable ${name} is not set.`);
  }
  return value;
}

function parseAccount(raw: string): string {
  const account = raw
    .replace(/^https?:\/\//, '')
    .replace(/\.mite\.de\/?$/, '')
    .toLowerCase();
  if (!/^[a-z0-9-]+$/.test(account)) {
    throw new ConfigError(
      'MITE_ACCOUNT must be the account name (the subdomain of <account>.mite.de).',
    );
  }
  return account;
}

function parseMode(raw: string | undefined): Mode {
  const mode = raw?.trim() || 'read-only';
  if (!(MODES as readonly string[]).includes(mode)) {
    throw new ConfigError(`MITE_MODE must be one of: ${MODES.join(', ')}.`);
  }
  return mode as Mode;
}

function parseTools(raw: string | undefined): readonly string[] | undefined {
  const tools = (raw ?? '')
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool !== '');
  return tools.length > 0 ? tools : undefined;
}

export function loadConfig(env: Env): Config {
  return {
    account: parseAccount(required(env, 'MITE_ACCOUNT')),
    apiKey: required(env, 'MITE_API_KEY'),
    mode: parseMode(env['MITE_MODE']),
    tools: parseTools(env['MITE_TOOLS']),
  };
}
