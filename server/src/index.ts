import fs from 'fs/promises';
import path from 'path';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { client, authClient } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { reseedLibraryData } from './db/reseedLibraries.js';
import { getPendingAndProcessingIds, getUploadById, resetToPending } from './services/userStls.service.js';
import { processUpload, getImageOutputDir } from './services/stlProcessing.service.js';
import { startCleanup } from './services/generationCleanup.service.js';
import { startWarpCleanup } from './services/refImageWarp.service.js';
import { provisionAdmin } from './services/auth.service.js';

async function main(): Promise<void> {
  // Run migrations
  logger.info('Running database migrations...');
  await runMigrations(client);
  logger.info('Migrations complete');
  // Private, deployment-controlled provisioning shared by real installs and E2E.
  // An existing account is never overwritten on restart.
  const admin = await client.execute('SELECT id FROM admin_account WHERE id = 1');
  if (!admin.rows.length && config.ADMIN_SETUP_PASSWORD_FILE) {
    const password = (await fs.readFile(config.ADMIN_SETUP_PASSWORD_FILE, 'utf8')).replace(/\r?\n$/, '');
    await provisionAdmin(password);
  }
  if (!admin.rows.length && !config.ADMIN_SETUP_PASSWORD_FILE) logger.warn('Admin is not provisioned. Run the private admin setup command before signing in.');

  // Create data directories
  await fs.mkdir(config.USER_STL_DIR, { recursive: true });
  await fs.mkdir(config.USER_STL_IMAGE_DIR, { recursive: true });
  await fs.mkdir(path.join(config.GENERATED_STL_DIR, 'library'), { recursive: true });
  await fs.mkdir(path.join(config.GENERATED_STL_DIR, 'custom'), { recursive: true });
  await fs.mkdir(config.THUMBNAIL_DIR, { recursive: true });

  // Startup recovery: reset stuck processing/pending rows and re-enqueue
  const stuckIds = await getPendingAndProcessingIds(client);
  for (const id of stuckIds) {
    await resetToPending(client, id);
    const row = await getUploadById(client, id);
    if (row) {
      const imageDir = getImageOutputDir();
      void processUpload(id, row.filePath, imageDir, row.userId);
    }
  }

  // Reseed library data from JSON files on every boot
  await reseedLibraryData(client, logger);
  startCleanup();
  logger.info('Generation cleanup service started');
  startWarpCleanup();

  // Create and start app
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(`Server listening on port ${config.PORT} (${config.NODE_ENV})`);
  });

  // Graceful shutdown
  function shutdown(signal: string): void {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed');
      client.close();
      if (authClient !== client) authClient.close();
      logger.info('Database connection closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
