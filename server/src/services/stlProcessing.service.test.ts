import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('child_process');
vi.mock('../db/client.js', () => ({ client: {} }));
vi.mock('../logger.js', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock('./userStls.service.js', () => ({
  updateUploadStatus: vi.fn().mockResolvedValue(undefined),
  getUploadById: vi.fn(),
}));
vi.mock('./stlQueue.service.js', () => ({
  stlQueue: { enqueue: (job: () => Promise<void>) => job() },
}));
vi.mock('../config.js', () => ({
  config: { PYTHON_SCRIPT_DIR: './scripts/py', MAX_STL_WORKERS: 2 },
}));

import { spawn } from 'child_process';
// Pre-load the module so dynamic imports inside tests resolve from cache
// (avoids a race where makeFakeChild's setTimeout fires before handlers are registered)
import './stlProcessing.service.js';
const mockSpawn = vi.mocked(spawn);

function makeFakeChild(stdoutData: string, stderrData: string, exitCode: number) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = new EventEmitter() as ReturnType<typeof spawn>;
  (child as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stdout = stdout;
  (child as unknown as { stdout: EventEmitter; stderr: EventEmitter }).stderr = stderr;
  setTimeout(() => {
    if (stdoutData) stdout.emit('data', Buffer.from(stdoutData));
    if (stderrData) stderr.emit('data', Buffer.from(stderrData));
    child.emit('close', exitCode);
  }, 0);
  return child;
}

describe('processUpload', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updates status to ready on success', async () => {
    const { updateUploadStatus } = await import('./userStls.service.js');
    const successJson = '{"gridX":2,"gridY":1,"imageUrl":"abc.png","perspImageUrls":["abc-p0.png","abc-p90.png","abc-p180.png","abc-p270.png"]}';
    mockSpawn.mockReturnValue(makeFakeChild(successJson, '', 0) as ReturnType<typeof spawn>);

    const { processUpload } = await import('./stlProcessing.service.js');
    await processUpload('abc', '/data/a.stl', '/data/images', 1);

    expect(updateUploadStatus).toHaveBeenCalledWith({}, 'abc', 'ready', expect.objectContaining({
      gridX: 2, gridY: 1, imageUrl: 'abc.png',
    }));
  });

  it('updates status to error when process exits non-zero', async () => {
    const { updateUploadStatus } = await import('./userStls.service.js');
    mockSpawn.mockReturnValue(makeFakeChild('', 'Invalid file format', 1) as ReturnType<typeof spawn>);

    const { processUpload } = await import('./stlProcessing.service.js');
    await processUpload('abc', '/data/a.stl', '/data/images', 1);

    expect(updateUploadStatus).toHaveBeenCalledWith({}, 'abc', 'error', expect.objectContaining({
      errorMessage: 'Invalid file format',
    }));
  });
});
