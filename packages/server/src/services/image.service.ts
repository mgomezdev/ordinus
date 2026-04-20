import { resolve, join } from 'node:path';
import { writeFile, rename, mkdir, unlink, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { config } from '../config.js';

const MAX_INPUT_SIZE = 5 * 1024 * 1024; // 5MB

// PNG: 89 50 4E 47
// JPEG: FF D8 FF
// WebP: 52 49 46 46 ... 57 45 42 50
function detectMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

function getExtension(mime: string): string {
  switch (mime) {
    case 'image/png':
      return '.png';
    case 'image/jpeg':
      return '.jpg';
    case 'image/webp':
      return '.webp';
    default:
      return '.bin';
  }
}

export interface ProcessedImage {
  filePath: string;
  sizeBytes: number;
}

export async function processAndSaveImage(
  inputBuffer: Buffer,
  subDir: string,
  filename?: string,
): Promise<ProcessedImage> {
  // Validate size
  if (inputBuffer.length > MAX_INPUT_SIZE) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `Image exceeds maximum size of ${MAX_INPUT_SIZE / 1024 / 1024}MB`,
    );
  }

  // Validate magic bytes
  const mimeType = detectMimeType(inputBuffer);
  if (!mimeType) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      'Invalid image format. Only PNG, JPEG, and WebP are supported.',
    );
  }

  // Re-encode with sharp to strip EXIF/embedded scripts
  let outputBuffer: Buffer;
  const sharpInstance = sharp(inputBuffer);

  switch (mimeType) {
    case 'image/png':
      outputBuffer = await sharpInstance.png().toBuffer();
      break;
    case 'image/jpeg':
      outputBuffer = await sharpInstance.jpeg({ quality: 90 }).toBuffer();
      break;
    case 'image/webp':
      outputBuffer = await sharpInstance.webp({ quality: 90 }).toBuffer();
      break;
    default:
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Unsupported image format');
  }

  // Build output path
  const imageDir = resolve(config.IMAGE_DIR);
  const targetDir = join(imageDir, subDir);
  await mkdir(targetDir, { recursive: true });

  const ext = getExtension(mimeType);
  const finalFilename = filename ?? `${randomUUID()}${ext}`;
  const finalPath = join(targetDir, finalFilename);
  const tmpPath = `${finalPath}.tmp`;

  // Atomic write: write to temp file, then rename
  await writeFile(tmpPath, outputBuffer);
  await rename(tmpPath, finalPath);

  return {
    filePath: `${subDir}/${finalFilename}`,
    sizeBytes: outputBuffer.length,
  };
}

export async function deleteImage(filePath: string): Promise<number> {
  const imageDir = resolve(config.IMAGE_DIR);
  const fullPath = join(imageDir, filePath);

  try {
    const fileStat = await stat(fullPath);
    const sizeBytes = fileStat.size;
    await unlink(fullPath);
    return sizeBytes;
  } catch {
    // File may already be deleted; that's fine
    return 0;
  }
}
