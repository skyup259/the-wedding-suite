import type { RequestHandler } from 'express';
import { sendError } from './errors.js';

export const apiNotFound: RequestHandler = (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'API route not found.');
};
