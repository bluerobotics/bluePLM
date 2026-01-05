import { AppError } from './AppError';
import { ErrorCode } from './ErrorCodes';

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(ErrorCode.NOT_FOUND, id ? `${resource} '${id}' not found` : `${resource} not found`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(ErrorCode.UNAUTHORIZED, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(ErrorCode.FORBIDDEN, message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(ErrorCode.CONFLICT, message, 409);
  }
}
