import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
export const h = (fn: Handler): RequestHandler => (req, res, next) => {
  fn(req, res, next).catch(next);
};

export function dbError(error: { code?: string; message?: string } | null | undefined, fallback = 'Database error'): never {
  if (error?.code === '23505') throw new AppError(409, 'Already exists', 'CONFLICT');
  if (error?.code === '23503') throw new AppError(400, 'Referenced record does not exist', 'BAD_REFERENCE');
  if (error?.code === '23514') throw new AppError(400, 'Value violates a constraint', 'CONSTRAINT');
  console.error('[db]', error?.code, error?.message); // never log row contents
  throw new AppError(500, fallback);
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Not found', code: 'NOT_FOUND' } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { message: 'Invalid input', code: 'VALIDATION', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: { message: tooBig ? 'Image is too large (max 5 MB)' : 'Invalid upload', code: 'UPLOAD' } });
  }
  if ((err as { type?: string })?.type === 'entity.too.large') return res.status(413).json({ error: { message: 'Request too large', code: 'TOO_LARGE' } });
  if ((err as { type?: string })?.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Malformed JSON', code: 'BAD_JSON' } });
  console.error('[unhandled]', (err as Error)?.message);
  return res.status(500).json({ error: { message: 'Something went wrong', code: 'INTERNAL' } });
}
