import type { McpServer } from '@modelcontextprotocol/server';

/** Asks the human a yes/no question; `undefined` if the client cannot be asked via elicitation. */
export type Elicit = (message: string) => Promise<'accept' | 'decline' | 'cancel' | undefined>;

/** Builds an {@link Elicit} bound to the connected client; it only asks if the client announced form elicitation. */
export function elicitFrom(server: McpServer): Elicit {
  // The deprecated push-style accessors are the only ones that work on the stdio (2025-era) connection used here.
  /* eslint-disable @typescript-eslint/no-deprecated */
  return async (message) => {
    // Form mode is what we ask in; a client announcing only `url` elicitation stays on the token-only flow.
    if (server.server.getClientCapabilities()?.elicitation?.form === undefined) return undefined;
    const answer = await server.server.elicitInput({
      mode: 'form',
      message,
      requestedSchema: { type: 'object', properties: {} },
    });
    return answer.action;
  };
  /* eslint-enable @typescript-eslint/no-deprecated */
}

/**
 * Asks the human to confirm an action that already carries a valid token. Clients without
 * elicitation are not asked (token only). Throws if the human declines or cancels, so the
 * caller must not execute anything; the token stays unused.
 */
export async function askHuman(
  elicit: Elicit,
  summary: string,
  nothingDone: string,
): Promise<void> {
  const answer = await elicit(summary);
  if (answer === 'decline' || answer === 'cancel') {
    throw new Error(
      `The human ${answer === 'decline' ? 'declined' : 'cancelled'} the confirmation; ${nothingDone}. The confirm_token stays valid until it expires.`,
    );
  }
}
