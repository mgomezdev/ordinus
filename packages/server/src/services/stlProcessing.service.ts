import { spawn } from 'child_process';
import path from 'path';
import { client } from '../db/client.js';
import { updateUploadStatus } from './userStls.service.js';
import { stlQueue } from './stlQueue.service.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export function processUpload(
  uploadId: string,
  filePath: string,
  imageOutputDir: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _userId: number,
): Promise<void> {
  return stlQueue.enqueue(async () => {
    // Spawn and register all event handlers synchronously before any await,
    // so that close/data events are never missed.
    let stdoutData = '';
    let stderrData = '';

    const scriptPath = path.resolve(config.PYTHON_SCRIPT_DIR, 'process_stl.py');
    const child = spawn('python3', [
      scriptPath,
      '--input', filePath,
      '--output-dir', imageOutputDir,
      '--id', uploadId,
    ]);

    child.stdout.on('data', (chunk: Buffer) => { stdoutData += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderrData += chunk.toString(); });

    const childClosed = new Promise<number | null>((resolve) => {
      child.on('close', resolve);
    });

    await updateUploadStatus(client, uploadId, 'processing');

    const code = await childClosed;

    if (code === 0) {
      try {
        const result = JSON.parse(stdoutData.trim()) as {
          gridX: number;
          gridY: number;
          imageUrl: string;
          perspImageUrls: string[];
        };
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
    } else {
      const errorMessage = stderrData.trim() || 'Processing failed with unknown error';
      logger.error({ uploadId, code, stderr: stderrData }, 'process_stl.py exited non-zero');
      await updateUploadStatus(client, uploadId, 'error', { errorMessage });
    }
  });
}

export function getImageOutputDir(userId: number): string {
  return path.join(config.USER_STL_IMAGE_DIR, String(userId));
}
