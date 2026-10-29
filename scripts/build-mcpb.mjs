#!/usr/bin/env node
// Builds the MCP bundle (.mcpb) for one-click install in Claude Desktop.
// Run `npm run build` first. Output: mite-mcp-server-<version>.mcpb in the repo root.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Pinned here instead of a devDependency, so the CLI's own dependency tree
// stays out of this package's lockfile and audit.
const MCPB = '@anthropic-ai/mcpb@2.1.2';

const root = new URL('..', import.meta.url).pathname;
const stage = join(root, 'build', 'mcpb');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'mcpb', 'manifest.json'), 'utf8'));

if (manifest.version !== version) {
  throw new Error(`mcpb/manifest.json has version ${manifest.version}, package.json ${version}.`);
}
if (!existsSync(join(root, 'dist', 'index.js'))) {
  throw new Error('dist/index.js is missing — run `npm run build` first.');
}

const run = (args, cwd = root) => {
  execFileSync('npx', ['--yes', ...args], { cwd, stdio: 'inherit' });
};

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

cpSync(join(root, 'mcpb', 'manifest.json'), join(stage, 'manifest.json'));
for (const file of ['package.json', 'package-lock.json', 'LICENSE', 'README.md']) {
  cpSync(join(root, file), join(stage, file));
}
cpSync(join(root, 'dist'), join(stage, 'server'), {
  recursive: true,
  filter: (source) => !source.endsWith('.map'),
});
execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: stage,
  stdio: 'inherit',
});

const output = join(root, `mite-mcp-server-${version}.mcpb`);
run([MCPB, 'validate', join(stage, 'manifest.json')]);
run([MCPB, 'pack', stage, output]);
console.log(`Bundle written to ${output}`);
