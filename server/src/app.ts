import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { logger } from './logger.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRoutes from './routes/health.routes.js';
import librariesRoutes from './routes/libraries.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import imagesRoutes from './routes/images.routes.js';
import layoutsRoutes from './routes/layouts.routes.js';
import bomRoutes from './routes/bom.routes.js';
import refImagesRoutes from './routes/refImages.routes.js';
import userStlsRouter from './routes/userStls.routes.js';
import generationRoutes from './routes/generation.routes.js';
import favoritesRoutes from './routes/favorites.routes.js';
import thumbnailsRoutes from './routes/thumbnails.routes.js';
import customersRoutes from './routes/customers.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import curatedLibrariesRoutes from './routes/curatedLibraries.routes.js';
import authRoutes from './routes/auth.routes.js';
import { checkMutationOrigin, requireAdmin } from './middleware/adminAuth.js';
import guestPreviewRoutes from './routes/guestPreview.routes.js';
import guestLinksRoutes from './routes/guestLinks.routes.js';
import { ownerLiveRouter } from './routes/live.routes.js';

export function createApp(): express.Express {
  const app = express();

  // Security headers
  app.use(helmet());

  // Body parsing
  app.use(express.json({ limit: '1mb' }));

  // Request ID
  app.use(requestIdMiddleware);

  // CORS
  app.use(corsMiddleware);

  // Trust first proxy hop (nginx) so req.ip reflects the real client IP
  app.set('trust proxy', 1);

  // Request logging
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => req.url === '/api/v1/health',
      },
    }),
  );

  // Entry/recovery routes and the separately scoped guest router precede the
  // owner boundary. Every ordinary API and asset route requires owner access.
  app.use('/api/v1', healthRoutes);
  app.use('/api/v1', checkMutationOrigin);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/guest', guestPreviewRoutes);
  app.use('/api/v1', requireAdmin);

  // Private assets are never shared-cacheable.
  app.use('/api/v1/images', imagesRoutes);
  app.use('/api/v1/thumbnails', thumbnailsRoutes);

  // Routes
  app.use('/api/v1/layouts/:layoutId/guest-links', guestLinksRoutes);
  app.use('/api/v1/layouts/:layoutId/live', ownerLiveRouter());
  app.use('/api/v1/libraries', librariesRoutes);
  app.use('/api/v1/curated-libraries', curatedLibrariesRoutes);
  app.use('/api/v1/categories', categoriesRoutes);
  app.use('/api/v1/layouts', layoutsRoutes);
  app.use('/api/v1/bom', bomRoutes);
  app.use('/api/v1/generation', generationRoutes);
  app.use('/api/v1/ref-images', refImagesRoutes);
  app.use('/api/v1/user-stls', userStlsRouter);
  app.use('/api/v1/favorites', favoritesRoutes);
  app.use('/api/v1/customers', customersRoutes);
  app.use('/api/v1', settingsRoutes);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
