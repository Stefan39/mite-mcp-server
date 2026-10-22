export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

export class MiteApiError extends Error {
  override readonly name = 'MiteApiError';

  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
