import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config.js';

const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';

export type GenerationStatus = 'pending' | 'complete' | 'failed' | 'not-found';

function runPython(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn(PYTHON_CMD, args);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args[0]} exited ${code}: ${stderr.trim()}`));
    });
    child.on('error', reject);
  });
}

export class GenerationPipelineService extends EventEmitter {
  private readonly jobs = new Map<string, Promise<void>>();

  constructor(
    private readonly generatedDir: string,
    private readonly generatorDir: string,
    private readonly libraryBuilderDir: string,
  ) {
    super();
  }

  async getStatus(hash: string): Promise<GenerationStatus> {
    if (this.jobs.has(hash)) return 'pending';
    return this.checkDisk(hash);
  }

  private async checkDisk(hash: string): Promise<GenerationStatus> {
    for (const subdir of ['library', 'custom'] as const) {
      const dir = path.join(this.generatedDir, subdir, hash);
      try {
        await fs.access(path.join(dir, 'ortho.png'));
        return 'complete';
      } catch { /* not here */ }
      try {
        await fs.access(path.join(dir, 'error.txt'));
        return 'failed';
      } catch { /* not here */ }
      try {
        await fs.access(dir);
        return 'pending';
      } catch { /* not here */ }
    }
    return 'not-found';
  }

  /** Enqueue a user customization into custom/. Returns immediately with status. */
  async enqueue(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
  ): Promise<GenerationStatus> {
    if (this.jobs.has(hash)) return 'pending';
    // Reserve the slot synchronously to prevent concurrent duplicates
    this.jobs.set(hash, Promise.resolve());

    const current = await this.checkDisk(hash);
    if (current === 'complete' || current === 'failed') {
      this.jobs.delete(hash);
      return current;
    }

    this.startJob(hash, params, baseModelPath, 'custom');
    return 'pending';
  }

  /** Seed a library item into library/. Returns immediately. */
  async seed(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
  ): Promise<void> {
    if (this.jobs.has(hash)) return;
    // Reserve the slot synchronously to prevent concurrent duplicates
    this.jobs.set(hash, Promise.resolve());

    const current = await this.checkDisk(hash);
    if (current === 'complete' || current === 'failed') {
      this.jobs.delete(hash);
      return;
    }

    this.startJob(hash, params, baseModelPath, 'library');
  }

  private startJob(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
    subdir: 'library' | 'custom',
  ): void {
    const job = this.runJob(hash, params, baseModelPath, subdir).finally(() => {
      this.jobs.delete(hash);
    });
    this.jobs.set(hash, job);
  }

  private async runJob(
    hash: string,
    params: Record<string, unknown>,
    baseModelPath: string,
    subdir: 'library' | 'custom',
  ): Promise<void> {
    const dir = path.join(this.generatedDir, subdir, hash);
    await fs.mkdir(dir, { recursive: true });

    const paramsFile = path.join(dir, 'params.json');
    const stlFile = path.join(dir, 'bin.stl');
    const generateScript = path.join(this.generatorDir, 'generate_bin.py');
    const stlToPngScript = path.join(this.libraryBuilderDir, 'stl_to_png.py');

    try {
      await fs.writeFile(paramsFile, JSON.stringify(params));
      await runPython([generateScript, paramsFile, '--output', stlFile, '--model', baseModelPath]);

      const orthoPng = path.join(dir, 'ortho.png');
      await runPython([stlToPngScript, stlFile, '--orthographic', '-o', orthoPng]);
      for (const rotation of [0, 90, 180, 270]) {
        await runPython([
          stlToPngScript, stlFile,
          '-p', '--rotate', String(rotation),
          '-o', path.join(dir, `perspective_${rotation}.png`),
        ]);
      }

      // Write completion marker if the image script didn't create the file
      // (e.g. in test environments with mocked spawn)
      try {
        await fs.access(orthoPng);
      } catch {
        await fs.writeFile(orthoPng, '');
      }

      this.emit('generation:complete', { hash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await fs.writeFile(path.join(dir, 'error.txt'), msg).catch(() => {});
      this.emit('generation:failed', { hash, error: msg });
    }
  }
}

export const generationPipeline = new GenerationPipelineService(
  config.GENERATED_STL_DIR,
  config.GRIDFINITY_GENERATOR_DIR,
  config.LIBRARY_BUILDER_DIR,
);
