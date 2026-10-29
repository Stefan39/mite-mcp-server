import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

interface Option {
  type: string;
  required?: boolean;
  sensitive?: boolean;
  default?: string | boolean;
}

interface Manifest {
  version: string;
  server: { mcp_config: { env: Record<string, string> } };
  user_config: Record<string, Option>;
}

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const manifest = readJson('../mcpb/manifest.json') as Manifest;
const env = manifest.server.mcp_config.env;
const options = manifest.user_config;

/** Mirrors how the bundle host fills `${user_config.*}` (booleans become "true"/"false"). */
function resolve(values: Record<string, string | boolean>): Record<string, string> {
  const merged: Record<string, string | boolean> = {};
  for (const [key, option] of Object.entries(options)) {
    if (option.default !== undefined) merged[key] = option.default;
  }
  Object.assign(merged, values);
  return Object.fromEntries(
    Object.entries(env).map(([name, template]) => [
      name,
      template.replace(/\$\{user_config\.([a-z_]+)\}/g, (placeholder, key: string) => {
        const value = merged[key];
        return value === undefined ? placeholder : String(value);
      }),
    ]),
  );
}

describe('MCP Registry server.json', () => {
  const pkg = readJson('../package.json') as { version: string; mcpName: string };
  const server = readJson('../server.json') as {
    name: string;
    version: string;
    packages: { registryType: string; identifier: string; version?: string }[];
  };

  it('uses the mcpName of package.json and its version', () => {
    expect(server.name).toBe(pkg.mcpName);
    expect(server.version).toBe(pkg.version);
    expect(server.packages.find((p) => p.registryType === 'npm')).toMatchObject({
      identifier: 'mite-mcp-server',
      version: pkg.version,
    });
  });

  it('points the bundle at the release of this version', () => {
    expect(server.packages.find((p) => p.registryType === 'mcpb')?.identifier).toBe(
      `https://github.com/Stefan39/mite-mcp-server/releases/download/v${pkg.version}/mite-mcp-server-${pkg.version}.mcpb`,
    );
  });
});

describe('mcpb manifest', () => {
  it('has the version of package.json', () => {
    expect(manifest.version).toBe((readJson('../package.json') as { version: string }).version);
  });

  it('references only declared settings', () => {
    for (const template of Object.values(env)) {
      for (const [, key] of template.matchAll(/\$\{user_config\.([a-z_]+)\}/g)) {
        expect(options).toHaveProperty(key as string);
      }
    }
  });

  it('requires account and key and stores the key as a secret', () => {
    expect(options['account']?.required).toBe(true);
    expect(options['api_key']).toMatchObject({ required: true, sensitive: true });
  });

  it('starts read-only with every tool when only the required settings are filled', () => {
    const config = loadConfig(resolve({ account: 'demo', api_key: 'key' }));
    expect(config.mode).toBe('read-only');
    expect(config.tools).toBeUndefined();
  });

  it.each([
    [{ allow_write: true }, 'write'],
    [{ allow_admin: true }, 'admin'],
    [{ allow_write: true, allow_admin: true }, 'admin'],
  ])('maps the switches %o to mode %s', (switches, mode) => {
    expect(loadConfig(resolve({ account: 'demo', api_key: 'key', ...switches })).mode).toBe(mode);
  });

  it('passes the optional allowlist through', () => {
    expect(
      loadConfig(resolve({ account: 'demo', api_key: 'key', tools: 'mite_whoami' })).tools,
    ).toEqual(['mite_whoami']);
  });
});
