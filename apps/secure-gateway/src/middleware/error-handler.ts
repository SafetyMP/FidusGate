import type { ErrorRequestHandler } from 'express';

/** Centralized Express error handler (must be registered after all routes). */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const message =
    typeof err?.message === 'string' && status < 500
      ? err.message
      : status === 500
        ? 'Internal Server Error'
        : 'Request failed';

  if (status >= 500) {
    console.error(err);
  }

  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
};
