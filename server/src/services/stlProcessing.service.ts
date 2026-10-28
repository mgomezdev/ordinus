import { spawn } from 'child_process';
import path from 'path';
import { client } from '../db/connection.js';
import { updateUploadStatus } from './userStls.service.js';
import { stlQueue } from './stlQueue.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

export function processUpload(
  uploadId: string,
  filePath: string,
  imageOutputDir: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: number | null,
): Promise<void> {
  return stlQueue.enqueue(async () => {
    // Spawn and register all event handlers synchronously before any await,
    // so that close/data events are never missed.
    let stdoutData = '';
    let stderrData = '';

    const scriptPath = path.resolve(config.PYTHON_SCRIPT_DIR, 'process_stl.py');
    const child = spawn(PYTHON_CMD, [
      scriptPath,
      '--input', filePath,
      '--output-dir', imageOutputDir,
      '--id', uploadId,
    ]);

    child.stdout.on('data', (chunk: Buffer) => { stdoutData += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderrData += chunk.toString(); });

    // 'error' (e.g. ENOENT when the interpreter is missing) is emitted instead of
    // 'close'. With no listener it throws as an uncaught exception and kills the
    // process — and since startup re-enqueues pending uploads, that is a boot loop.
    const childClosed = new Promise<{ code: number | null; spawnError: Error | null }>((resolve) => {
      child.on('close', (code) => resolve({ code, spawnError: null }));
      child.on('error', (spawnError: Error) => resolve({ code: null, spawnError }));
    });

    logger.info({ uploadId }, 'STL processing: started');
    await updateUploadStatus(client, uploadId, 'processing');

    const { code, spawnError } = await childClosed;

    if (code === 0) {
      try {
        const result = JSON.parse(stdoutData.trim()) as {
          gridX: number;
          gridY: number;
          imageUrl: string;
          perspImageUrls: string[];
        };
        logger.info({ uploadId, gridX: result.gridX, gridY: result.gridY }, 'STL processing: complete');
        await updateUploadStatus(client, uploadId, 'ready', {
          gridX: result.gridX,
          gridY: result.gridY,
          imageUrl: result.imageUrl,
          perspImageUrls: result.perspImageUrls,
        });
      } catch (e) {
        logger.error({ uploadId, err: e }, 'Failed to parse process_stl.py output');
        await updateUploadStatus(client, uploadId, 'error', {
          errorMessage: 'Failed to parse processing output',
        });
      }
    } else if (spawnError) {
      const errorMessage = `Could not run ${PYTHON_CMD}: ${spawnError.message}`;
      logger.error({ uploadId, err: spawnError }, 'process_stl.py failed to spawn');
      await updateUploadStatus(client, uploadId, 'error', { errorMessage });
    } else {
      const errorMessage = stderrData.trim() || 'Processing failed with unknown error';
      logger.error({ uploadId, code, stderr: stderrData }, 'process_stl.py exited non-zero');
      await updateUploadStatus(client, uploadId, 'error', { errorMessage });
    }
  });
}

export function getImageOutputDir(): string {
  return path.join(config.USER_STL_IMAGE_DIR, 'global');
}
