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

describe('loadConfig mode switches', () => {
  it.each([
    [{}, 'read-only'],
    [{ MITE_ALLOW_WRITE: 'false', MITE_ALLOW_ADMIN: 'false' }, 'read-only'],
    [{ MITE_ALLOW_WRITE: 'true' }, 'write'],
    [{ MITE_ALLOW_WRITE: 'true', MITE_ALLOW_ADMIN: 'false' }, 'write'],
    [{ MITE_ALLOW_ADMIN: 'true' }, 'admin'],
    [{ MITE_ALLOW_WRITE: 'true', MITE_ALLOW_ADMIN: 'true' }, 'admin'],
    [{ MITE_ALLOW_WRITE: ' TRUE ' }, 'write'],
    [{ MITE_ALLOW_WRITE: '1' }, 'write'],
    [{ MITE_ALLOW_WRITE: '' }, 'read-only'],
  ])('derives the mode from %o', (switches, expected) => {
    expect(loadConfig({ ...base, ...switches }).mode).toBe(expected);
  });

  it('rejects a switch that is not true or false', () => {
    expect(() => loadConfig({ ...base, MITE_ALLOW_WRITE: 'maybe' })).toThrow(
      'MITE_ALLOW_WRITE must be true or false',
    );
  });

  it('keeps MITE_MODE for hand-written configurations', () => {
    expect(
      loadConfig({ ...base, MITE_MODE: 'write', MITE_ALLOW_WRITE: 'false', MITE_ALLOW_ADMIN: '0' })
        .mode,
    ).toBe('write');
  });

  it('refuses MITE_MODE combined with an enabled switch', () => {
    expect(() => loadConfig({ ...base, MITE_MODE: 'read-only', MITE_ALLOW_WRITE: 'true' })).toThrow(
      'not both',
    );
  });

  it('treats placeholders left by the bundle host as unset', () => {
    const config = loadConfig({
      ...base,
      MITE_MODE: '${user_config.mode}',
      MITE_ALLOW_WRITE: '${user_config.allow_write}',
      MITE_TOOLS: '${user_config.tools}',
    });
    expect(config.mode).toBe('read-only');
    expect(config.tools).toBeUndefined();
    expect(() => loadConfig({ ...base, MITE_API_KEY: '${user_config.api_key}' })).toThrow(
      'MITE_API_KEY is not set',
    );
  });
});
