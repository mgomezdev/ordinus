import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiUser } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { users, refreshTokens } from '../db/schema.js';
import { config } from '../config.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateFamilyId(): string {
  return crypto.randomUUID();
}

function formatUser(row: typeof users.$inferSelect): ApiUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role as ApiUser['role'],
    createdAt: row.createdAt,
  };
}

function signAccessToken(userId: number, role: string): string {
  return jwt.sign({ userId, role }, config.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

async function createTokenPair(userId: number, role: string, familyId?: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken(userId, role);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);
  const family = familyId ?? generateFamilyId();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS).toISOString();
  const now = new Date().toISOString();

  await db.insert(refreshTokens).values({
    userId,
    familyId: family,
    tokenHash,
    isRevoked: false,
    expiresAt,
    createdAt: now,
  });

  return { accessToken, refreshToken };
}

export async function registerUser(
  email: string,
  username: string,
  password: string,
): Promise<{ user: ApiUser; accessToken: string; refreshToken: string }> {
  // Check if email or username already exists
  const existingEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingEmail.length > 0) {
    throw new AppError(ErrorCodes.CONFLICT, 'Email already registered');
  }

  const existingUsername = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (existingUsername.length > 0) {
    throw new AppError(ErrorCodes.CONFLICT, 'Username already taken');
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const now = new Date().toISOString();

  const result = await db.insert(users).values({
    email,
    username,
    passwordHash,
    role: 'user',
    failedLoginAttempts: 0,
    createdAt: now,
    updatedAt: now,
  }).returning();

  const userRow = result[0];
  const user = formatUser(userRow);
  const { accessToken, refreshToken } = await createTokenPair(user.id, user.role);

  return { user, accessToken, refreshToken };
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: ApiUser; accessToken: string; refreshToken: string }> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Invalid email or password');
  }

  const userRow = rows[0];

  // Check lockout
  if (userRow.lockedUntil) {
    const lockedUntilDate = new Date(userRow.lockedUntil);
    if (lockedUntilDate > new Date()) {
      throw new AppError(ErrorCodes.ACCOUNT_LOCKED, 'Account is temporarily locked. Try again later.');
    }
    // Lockout expired, reset counters
    await db.update(users).set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, userRow.id));
    userRow.failedLoginAttempts = 0;
    userRow.lockedUntil = null;
  }

  // Verify password
  const passwordValid = await argon2.verify(userRow.passwordHash, password);
  if (!passwordValid) {
    const newAttempts = userRow.failedLoginAttempts + 1;
    const updates: Record<string, unknown> = {
      failedLoginAttempts: newAttempts,
      updatedAt: new Date().toISOString(),
    };

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      updates.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString();
    }

    await db.update(users).set(updates).where(eq(users.id, userRow.id));

    throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Invalid email or password');
  }

  // Reset failed attempts on successful login
  if (userRow.failedLoginAttempts > 0) {
    await db.update(users).set({
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    }).where(eq(users.id, userRow.id));
  }

  const user = formatUser(userRow);
  const { accessToken, refreshToken } = await createTokenPair(user.id, user.role);

  return { user, accessToken, refreshToken };
}

export async function refreshAccessToken(
  rawRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashToken(rawRefreshToken);

  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Invalid refresh token');
  }

  const tokenRow = rows[0];

  // Detect token reuse: if revoked, invalidate entire family
  if (tokenRow.isRevoked) {
    await db.update(refreshTokens).set({ isRevoked: true })
      .where(eq(refreshTokens.familyId, tokenRow.familyId));
    throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Token reuse detected. All sessions in this family have been revoked.');
  }

  // Check expiry
  if (new Date(tokenRow.expiresAt) < new Date()) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Refresh token expired');
  }

  // Revoke the used token
  await db.update(refreshTokens).set({ isRevoked: true })
    .where(eq(refreshTokens.id, tokenRow.id));

  // Get user
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.id, tokenRow.userId))
    .limit(1);

  if (userRows.length === 0) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, 'User not found');
  }

  const userRow = userRows[0];

  // Create new token pair in the same family
  return createTokenPair(userRow.id, userRow.role, tokenRow.familyId);
}

export async function logoutUser(
  userId: number,
  rawRefreshToken: string,
): Promise<void> {
  const tokenHash = hashToken(rawRefreshToken);

  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) {
    return; // Token not found, nothing to do
  }

  const tokenRow = rows[0];

  // Verify the token belongs to this user
  if (tokenRow.userId !== userId) {
    return;
  }

  // Revoke entire family
  await db.update(refreshTokens).set({ isRevoked: true })
    .where(eq(refreshTokens.familyId, tokenRow.familyId));
}

export async function getUserById(id: number): Promise<ApiUser> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
  }

  return formatUser(rows[0]);
}

export async function updateUser(
  id: number,
  updates: { username?: string; email?: string },
): Promise<ApiUser> {
  // Check for conflicts
  if (updates.email) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, updates.email))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== id) {
      throw new AppError(ErrorCodes.CONFLICT, 'Email already in use');
    }
  }

  if (updates.username) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, updates.username))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== id) {
      throw new AppError(ErrorCodes.CONFLICT, 'Username already taken');
    }
  }

  const setValues: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.email) setValues.email = updates.email;
  if (updates.username) setValues.username = updates.username;

  await db.update(users).set(setValues).where(eq(users.id, id));

  return getUserById(id);
}

export async function changePassword(
  id: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'User not found');
  }

  const userRow = rows[0];
  const passwordValid = await argon2.verify(userRow.passwordHash, currentPassword);

  if (!passwordValid) {
    throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Current password is incorrect');
  }

  const newHash = await argon2.hash(newPassword, { type: argon2.argon2id });

  await db.update(users).set({
    passwordHash: newHash,
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, id));
}
