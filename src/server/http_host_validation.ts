import type { RequestHandler } from 'express';

/** HTTP authority validation only; forwarded headers never grant authority. */
export function httpHostAllowed(rawHeaders: readonly string[]): boolean {
  let count = 0;
  let host = '';
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'host') {
      count++;
      host = rawHeaders[i + 1];
    }
  }
  return count === 1 && (host === 'localhost:3001' || host === '127.0.0.1:3001');
}

export const validateHttpHost: RequestHandler = (req, res, next) => {
  if (!httpHostAllowed(req.rawHeaders)) {
    res.status(400).type('text/plain').send('Invalid HTTP Host.');
    return;
  }
  next();
};
