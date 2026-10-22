import type { ToolDefinition } from './definition.js';
import { reportProjectsByMonth } from './reportProjectsByMonth.js';
import { whoami } from './whoami.js';

/** Every tool the server knows. Which of them a session gets decides `selectTools`. */
export const allTools: readonly ToolDefinition[] = [whoami, reportProjectsByMonth];
