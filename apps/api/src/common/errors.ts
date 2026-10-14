import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Errors carry a stable `code` the clients translate (e.g. "auth.locked"),
 * plus optional params for interpolation.
 */
export class AppError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, params?: Record<string, unknown>) {
    super({ code, message, params }, status);
  }
}

export const badRequest = (code: string, message: string, params?: Record<string, unknown>) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, params);
export const forbidden = (message = 'You do not have permission for this action') =>
  new AppError(HttpStatus.FORBIDDEN, 'forbidden', message);
export const notFound = (what: string) => new AppError(HttpStatus.NOT_FOUND, 'notFound', `${what} not found`);
export const conflict = (code: string, message: string) => new AppError(HttpStatus.CONFLICT, code, message);
