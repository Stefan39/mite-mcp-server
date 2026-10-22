import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';
import { ConfigError } from '../src/errors.js';

const base = { MITE_ACCOUNT: 'demo', MITE_API_KEY: 'key' };

describe('loadConfig', () => {
  it('defaults to read-only without allowlist', () => {
    expect(loadConfig(base)).toEqual({
      account: 'demo',
      apiKey: 'key',
      mode: 'read-only',
      tools: undefined,
    });
  });

  it.each([
    ['https://Demo.mite.de/', 'demo'],
    ['demo.mite.de', 'demo'],
    ['my-team', 'my-team'],
  ])('normalises account %s', (raw, expected) => {
    expect(loadConfig({ ...base, MITE_ACCOUNT: raw }).account).toBe(expected);
  });

  it('rejects an account that is not a subdomain', () => {
    expect(() => loadConfig({ ...base, MITE_ACCOUNT: 'evil.example.com/x' })).toThrow(ConfigError);
  });

  it.each(['MITE_ACCOUNT', 'MITE_API_KEY'])('requires %s', (name) => {
    expect(() => loadConfig({ ...base, [name]: ' ' })).toThrow(`${name} is not set`);
  });

  it('accepts the write and admin modes and rejects others', () => {
    expect(loadConfig({ ...base, MITE_MODE: 'write' }).mode).toBe('write');
    expect(loadConfig({ ...base, MITE_MODE: 'admin' }).mode).toBe('admin');
    expect(() => loadConfig({ ...base, MITE_MODE: 'root' })).toThrow(ConfigError);
  });

  it('parses the tool allowlist', () => {
    expect(loadConfig({ ...base, MITE_TOOLS: ' mite_whoami, ,mite_report ' }).tools).toEqual([
      'mite_whoami',
      'mite_report',
    ]);
    expect(loadConfig({ ...base, MITE_TOOLS: ' , ' }).tools).toBeUndefined();
  });
});
