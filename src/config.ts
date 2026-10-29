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

/**
 * Reads a variable, trimmed. Empty values and placeholders that the MCP
 * bundle host left unresolved (`${user_config.tools}` for an optional
 * setting without a value) count as unset.
 */
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  if (!value || /^\$\{[^}]+\}$/.test(value)) {
    return undefined;
  }
  return value;
}

function required(env: Env, name: string): string {
  const value = read(env, name);
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

const TRUE_VALUES = ['true', '1', 'yes', 'on'];
const FALSE_VALUES = ['false', '0', 'no', 'off'];

function parseSwitch(env: Env, name: string): boolean {
  const raw = read(env, name)?.toLowerCase();
  if (raw === undefined || FALSE_VALUES.includes(raw)) {
    return false;
  }
  if (TRUE_VALUES.includes(raw)) {
    return true;
  }
  throw new ConfigError(`${name} must be true or false.`);
}

/**
 * `MITE_MODE` is for people who write the configuration by hand. The MCP
 * bundle offers no choice field, so its settings arrive as two switches:
 * `MITE_ALLOW_WRITE` and `MITE_ALLOW_ADMIN`. Admin includes writing, because
 * the modes are ranked. Mixing both styles is refused rather than guessed.
 */
function parseMode(env: Env): Mode {
  const allowWrite = parseSwitch(env, 'MITE_ALLOW_WRITE');
  const allowAdmin = parseSwitch(env, 'MITE_ALLOW_ADMIN');
  const explicit = read(env, 'MITE_MODE');
  if (explicit !== undefined) {
    if (!(MODES as readonly string[]).includes(explicit)) {
      throw new ConfigError(`MITE_MODE must be one of: ${MODES.join(', ')}.`);
    }
    if (allowWrite || allowAdmin) {
      throw new ConfigError('Set either MITE_MODE or MITE_ALLOW_WRITE/MITE_ALLOW_ADMIN, not both.');
    }
    return explicit as Mode;
  }
  if (allowAdmin) {
    return 'admin';
  }
  return allowWrite ? 'write' : 'read-only';
}

function parseTools(env: Env): readonly string[] | undefined {
  const tools = (read(env, 'MITE_TOOLS') ?? '')
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool !== '');
  return tools.length > 0 ? tools : undefined;
}

export function loadConfig(env: Env): Config {
  return {
    account: parseAccount(required(env, 'MITE_ACCOUNT')),
    apiKey: required(env, 'MITE_API_KEY'),
    mode: parseMode(env),
    tools: parseTools(env),
  };
}
