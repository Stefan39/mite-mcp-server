import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server';
import type { z } from 'zod';

import type { Config, Mode } from '../config.js';
import type { MiteClient } from '../mite/client.js';

export interface ToolContext {
  client: MiteClient;
  config: Config;
  /** Names of all tools registered for this session. */
  enabledTools: readonly string[];
}

export interface ToolDefinition<Input extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  /** Lowest MITE_MODE in which the tool is offered at all. */
  mode: Mode;
  annotations: ToolAnnotations;
  inputSchema: Input;
  handler: (input: z.infer<Input>, context: ToolContext) => Promise<CallToolResult>;
}

export function defineTool<Input extends z.ZodObject>(
  definition: ToolDefinition<Input>,
): ToolDefinition<Input> {
  return definition;
}

/** Wraps a result so that agents get both readable text and structured data. */
export function result(text: string, data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: data,
  };
}
