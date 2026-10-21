import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { corsOrigins, env } from './env';
import { errorHandler, notFound } from './lib/errors';
import { publicRouter } from './routes/public';
import { meRouter } from './routes/me';
import { listingsRouter } from './routes/listings';
import { favoritesRouter } from './routes/favorites';
import { conversationsRouter } from './routes/conversations';
import { reportsRouter } from './routes/reports';
import { adminRouter } from './routes/admin';

const allowedOrigins = new Set([...corsOrigins, 'https://revoshelf-web.onrender.com']);

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render terminates TLS in front of the service
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin(origin, cb) {
        // Non-browser clients send no Origin header; browsers must be on the allowlist.
        if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) return cb(null, true);
        return cb(null, false);
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    })
  );
  app.use(express.json({ limit: '50kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', env: env.NODE_ENV }));

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.NODE_ENV === 'test' ? 10_000 : 600, standardHeaders: true, legacyHeaders: false });
  const api = express.Router();
  api.use(limiter);
  api.use(publicRouter, meRouter, listingsRouter, favoritesRouter, conversationsRouter, reportsRouter, adminRouter);
  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
