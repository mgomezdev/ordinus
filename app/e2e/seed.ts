/**
 * Declarative test data for Ordinus E2E.
 * Consumed by global-setup.ts before any Playwright tests run.
 * The server starts with DB_PATH=:memory: so the DB is always empty on startup;
 * library data is auto-seeded by the server at boot.
 */

export const E2E_CUSTOMERS = [
  { name: 'E2E Customer Alpha' },
  { name: 'E2E Customer Beta' },
];

/** Grid dimensions for the sample layout seeded before tests. */
export const SAMPLE_LAYOUT = {
  name: 'E2E Sample 4×2 Layout',
  gridX: 4,
  gridY: 2,
  widthMm: 168.0,
  depthMm: 84.0,
  spacerHorizontal: 'none',
  spacerVertical: 'none',
};
