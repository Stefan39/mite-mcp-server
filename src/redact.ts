const PLACEHOLDER = '[redacted]';

/**
 * Removes every occurrence of the given secrets from a text.
 * Used for all error messages that leave the server, so an API key can never
 * end up in a tool result or a log line.
 */
export function redact(text: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length >= 4)
    .reduce((result, secret) => result.split(secret).join(PLACEHOLDER), text);
}
