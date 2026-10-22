import type { Config, Mode } from './config.js';
import { MODES } from './config.js';

interface Guarded {
  name: string;
  mode: Mode;
}

const rank = (mode: Mode): number => MODES.indexOf(mode);

/**
 * Decides which tools are registered at all. A tool outside the configured
 * mode or allowlist is never shown to the agent, so it cannot be called —
 * not even by an instruction injected through data the agent reads.
 *
 * mite still checks every request against the role of the API key; this
 * guard only narrows what that key could do.
 */
export function selectTools<T extends Guarded>(tools: readonly T[], config: Config): T[] {
  return tools.filter(
    (tool) =>
      rank(tool.mode) <= rank(config.mode) &&
      (config.tools === undefined || config.tools.includes(tool.name)),
  );
}

/** Allowlist entries that match no known tool — most likely typos. */
export function unknownAllowlistEntries(tools: readonly Guarded[], config: Config): string[] {
  const known = new Set(tools.map((tool) => tool.name));
  return (config.tools ?? []).filter((name) => !known.has(name));
}
