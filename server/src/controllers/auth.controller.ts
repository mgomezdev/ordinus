import { z } from 'zod';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import type { ApiResponse, AuthResponse, TokenResponse, ApiUser } from '@gridfinity/shared';
import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';

const registerSchema = z.object({
  email: z.string().email().max(254),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Username must be alphanumeric with hyphens/underscores'),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

const updateMeSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  email: z.string().email().max(254).optional(),
}).refine(data => data.username || data.email, {
  message: 'At least one field must be provided',
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const { email, username, password } = parsed.data;
    const result = await authService.registerUser(email, username, password);

    const body: ApiResponse<AuthResponse> = { data: result };
    res.status(201).json(body);
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const { email, password } = parsed.data;
    const result = await authService.loginUser(email, password);

    const body: ApiResponse<AuthResponse> = { data: result };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const result = await authService.refreshAccessToken(parsed.data.refreshToken);

    const body: ApiResponse<TokenResponse> = { data: result };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = logoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    await authService.logoutUser(req.user.userId, parsed.data.refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const user = await authService.getUserById(req.user.userId);

    const body: ApiResponse<ApiUser> = { data: user };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    const user = await authService.updateUser(req.user.userId, parsed.data);

    const body: ApiResponse<ApiUser> = { data: user };
    res.json(body);
  } catch (err) {
    next(err);
  }
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Authentication required');
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Validation failed', parsed.error.flatten());
    }

    await authService.changePassword(
      req.user.userId,
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
