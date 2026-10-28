import type { CallToolResult } from '@modelcontextprotocol/server';
import { McpServer } from '@modelcontextprotocol/server';

import type { Config } from './config.js';
import { ConfirmationTokens } from './confirm.js';
import { elicitFrom } from './elicit.js';
import { selectTools } from './guard.js';
import type { MiteClient } from './mite/client.js';
import { redact } from './redact.js';
import type { ToolDefinition } from './tools/definition.js';
import { allTools } from './tools/index.js';
import { VERSION } from './version.js';

function failure(error: unknown, config: Config): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text', text: redact(message, [config.apiKey]) }],
  };
}

export function createServer(
  config: Config,
  client: MiteClient,
  tools: readonly ToolDefinition[] = allTools,
  confirmations: ConfirmationTokens = new ConfirmationTokens(),
): McpServer {
  const server = new McpServer(
    { name: 'mite-mcp-server', version: VERSION },
    { capabilities: { tools: {} } },
  );
  const selected = selectTools(tools, config);
  const context = {
    client,
    config,
    confirmations,
    elicit: elicitFrom(server),
    enabledTools: selected.map((tool) => tool.name),
  };

  for (const tool of selected) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema:
          config.mode === 'admin' ? (tool.adminInputSchema ?? tool.inputSchema) : tool.inputSchema,
        annotations: tool.annotations,
      },
      async (input: unknown) => {
        try {
          return await tool.handler(input as never, context);
        } catch (error) {
          return failure(error, config);
        }
      },
    );
  }
  return server;
}
