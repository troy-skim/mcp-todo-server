export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
}

export interface MCPError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }

  toMCPError(): MCPError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function createValidationError(message: string, details?: unknown): AppError {
  return new AppError(ErrorCode.VALIDATION_ERROR, message, details);
}

export function createNotFoundError(resource: string, id: string): AppError {
  return new AppError(ErrorCode.NOT_FOUND, `${resource} with id '${id}' not found`);
}

export function createDatabaseError(message: string): AppError {
  return new AppError(ErrorCode.DATABASE_ERROR, message);
}

export function createInternalError(message: string): AppError {
  return new AppError(ErrorCode.INTERNAL_ERROR, message);
}

export function formatErrorResponse(error: unknown): string {
  if (error instanceof AppError) {
    return JSON.stringify(error.toMCPError(), null, 2);
  }

  if (error instanceof Error) {
    return JSON.stringify({
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message,
    }, null, 2);
  }

  return JSON.stringify({
    code: ErrorCode.INTERNAL_ERROR,
    message: 'An unexpected error occurred',
  }, null, 2);
}
