import type { BuiltInProvider } from "./types";

export type ConductorErrorCode =
  | "CONFIGURATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "REQUEST_ERROR"
  | "TIMEOUT"
  | "ABORTED"
  | "NETWORK_ERROR"
  | "PROVIDER_ERROR"
  | "PROVIDER_RESPONSE_ERROR"
  | "VALIDATION_ERROR"
  | "STREAM_ERROR"
  | "UNSUPPORTED_FEATURE";

export interface ConductorErrorOptions {
  code: ConductorErrorCode;
  provider?: BuiltInProvider | string;
  status?: number;
  retryable?: boolean;
  retryAfterMs?: number;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
}

export class ConductorError extends Error {
  readonly code: ConductorErrorCode;
  readonly provider?: BuiltInProvider | string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly requestId?: string;
  readonly details?: unknown;
  override readonly cause?: unknown;

  constructor(message: string, options: ConductorErrorOptions) {
    super(message);
    this.name = "ConductorError";
    this.code = options.code;
    this.provider = options.provider;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.requestId = options.requestId;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isConductorError(error: unknown): error is ConductorError {
  return error instanceof ConductorError;
}

export function configurationError(message: string, details?: unknown): ConductorError {
  return new ConductorError(message, {
    code: "CONFIGURATION_ERROR",
    details,
  });
}

export function providerResponseError(
  provider: BuiltInProvider | string,
  message: string,
  details?: unknown,
): ConductorError {
  return new ConductorError(message, {
    code: "PROVIDER_RESPONSE_ERROR",
    provider,
    details,
  });
}
