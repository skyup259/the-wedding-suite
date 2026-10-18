import type { ErrorRequestHandler, Response } from 'express';
import type { ApiErrorResponse } from '@wedding-suite/shared/http';

export class HttpError extends Error {
  fields?: ApiErrorResponse['error']['fields'];
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  const body: ApiErrorResponse = {
    error: { code, message },
    meta: { requestId: res.locals.requestId as string },
  };
  res.status(status).json(body);
}

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
      meta: { requestId: res.locals.requestId },
    });
    return;
  }
  const type =
    error && typeof error === 'object' && 'type' in error
      ? error.type
      : undefined;
  if (type === 'entity.parse.failed') {
    sendError(res, 400, 'BAD_REQUEST', 'Malformed JSON body.');
    return;
  }
  if (type === 'entity.too.large') {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    return;
  }
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
};
