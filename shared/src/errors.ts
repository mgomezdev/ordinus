export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export const ErrorStatusMap: Record<ErrorCode, number> = {
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.AUTH_REQUIRED]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.CONFLICT]: 409,
  [ErrorCodes.QUOTA_EXCEEDED]: 413,
  [ErrorCodes.ACCOUNT_LOCKED]: 423,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.INTERNAL_ERROR]: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get statusCode(): number {
    return ErrorStatusMap[this.code];
  }
}
