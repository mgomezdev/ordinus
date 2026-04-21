import { z } from 'zod';

const KNOWN_WEAK_SECRETS = new Set([
  'dev-jwt-secret-change-in-production',
  'dev-refresh-secret-change-in-production',
]);

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DB_PATH: z.string().default('./data/gridfinity.db'),
  IMAGE_DIR: z.string().default('./data/images'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET must be set').default('dev-jwt-secret-change-in-production'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET must be set').default('dev-refresh-secret-change-in-production'),
  USER_STL_DIR: z.string().default('./data/user-stls'),
  USER_STL_IMAGE_DIR: z.string().default('./data/user-stl-images'),
  MAX_STL_WORKERS: z.coerce.number().default(2),
  PYTHON_SCRIPT_DIR: z.string().default('./scripts/py'),
  GRIDFINITY_GENERATOR_DIR: z.string().default('../../tools/gridfinity-generator'),
  GENERATED_STL_DIR: z.string().default('./data/generated'),
  LIBRARY_BUILDER_DIR: z.string().default('../../tools/library-builder'),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (KNOWN_WEAK_SECRETS.has(data.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be changed from the default value in production. Set a strong random secret (e.g. openssl rand -hex 32).',
      });
    }
    if (KNOWN_WEAK_SECRETS.has(data.JWT_REFRESH_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must be changed from the default value in production. Set a strong random secret (e.g. openssl rand -hex 32).',
      });
    }
  }
});

export type Config = z.infer<typeof envSchema>;
export const config = envSchema.parse(process.env);
