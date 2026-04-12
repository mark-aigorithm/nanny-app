// Load and validate environment FIRST so any missing config crashes early
// before we initialize Firebase, Prisma, or bind a port.
import { config } from '@backend/lib/config';

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { apiRouter } from '@backend/routes';
import { errorHandler, notFoundHandler } from '@backend/middleware/error.middleware';

function buildApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  if (config.nodeEnv !== 'test') {
    app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
  }

  app.use(apiRouter);

  // 404 + global error handler must be the last middleware in the stack.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

const app = buildApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${config.port} (${config.nodeEnv})`);
});
