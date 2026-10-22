#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { loadConfig } from './config.js';
import { ConfigError } from './errors.js';
import { unknownAllowlistEntries } from './guard.js';
import { MiteClient } from './mite/client.js';
import { redact } from './redact.js';
import { createServer } from './server.js';
import { allTools } from './tools/index.js';
import { USER_AGENT } from './version.js';

// stdout belongs to the MCP protocol; everything for humans goes to stderr.
const log = (message: string): void => {
  process.stderr.write(`[mite-mcp-server] ${message}\n`);
};

function main(): void {
  const config = loadConfig(process.env);
  for (const name of unknownAllowlistEntries(allTools, config)) {
    log(`MITE_TOOLS lists unknown tool "${name}" — ignored.`);
  }
  const client = new MiteClient({
    account: config.account,
    apiKey: config.apiKey,
    userAgent: USER_AGENT,
  });
  serveStdio(() => createServer(config, client), {
    onerror: (error) => {
      log(redact(error.message, [config.apiKey]));
    },
  });
  log(`running for account "${config.account}" in mode ${config.mode}`);
}

try {
  main();
} catch (error) {
  log(error instanceof ConfigError ? error.message : `startup failed: ${String(error)}`);
  process.exit(1);
}
