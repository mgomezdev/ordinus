import { rm, mkdir } from 'fs/promises';

const TEST_IMAGE_DIR = '/tmp/gridfinity-e2e-images';

export default async function globalSetup(): Promise<void> {
  // Ensure the test image directory is clean before each run
  await rm(TEST_IMAGE_DIR, { recursive: true, force: true });
  await mkdir(TEST_IMAGE_DIR, { recursive: true });
}
