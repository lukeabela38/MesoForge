export type HevyErrorCode =
  | 'authentication'
  | 'not_found'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'timeout'
  | 'contract'
  | 'invalid_input'
  | 'write_blocked'
  | 'http';

export type HevyCommitState = 'not_sent' | 'unknown' | 'confirmed';

export interface HevyClientErrorOptions {
  readonly code: HevyErrorCode;
  readonly endpoint: string;
  readonly method: 'GET' | 'PUT';
  readonly message: string;
  readonly status?: number;
  readonly retryable?: boolean;
  readonly commitState?: HevyCommitState;
  readonly cause?: unknown;
}

export class HevyClientError extends Error {
  readonly code: HevyErrorCode;
  readonly endpoint: string;
  readonly method: 'GET' | 'PUT';
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly commitState: HevyCommitState;

  constructor(options: HevyClientErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'HevyClientError';
    this.code = options.code;
    this.endpoint = options.endpoint;
    this.method = options.method;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.commitState = options.commitState ?? 'not_sent';
  }
}

export function isHevyClientError(error: unknown): error is HevyClientError {
  return error instanceof HevyClientError;
}
