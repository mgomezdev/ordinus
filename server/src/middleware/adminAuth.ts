import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { authService } from '../services/auth.service.js';
import { config } from '../config.js';

export const ADMIN_COOKIE = 'ordinus_admin';
export const secureCookie = config.AUTH_COOKIE_SECURE === 'true' || (config.AUTH_COOKIE_SECURE !== 'false' && config.NODE_ENV === 'production');
export function readAdminCookie(req: Request): string {
  return req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1) ?? '';
}
export function checkMutationOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const allowed = new Set([config.CORS_ORIGIN, config.PUBLIC_URL].filter(url => url && URL.canParse(url)).map(url => new URL(url).origin));
  const origin = req.get('Origin');
  // Non-browser API clients must explicitly opt in with a header that HTML
  // forms cannot send. Never trust an arbitrary Origin or forwarded Host.
  if ((origin && allowed.has(origin)) || (!origin && req.get('X-Ordinus-Request') === '1' && req.get('Sec-Fetch-Site') !== 'cross-site')) return next();
  next(new AppError(ErrorCodes.FORBIDDEN, 'Request origin is not allowed'));
}
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await authService.session(readAdminCookie(req));
    if (!session) throw new AppError(ErrorCodes.AUTH_REQUIRED, 'Sign in as admin to continue');
    res.setHeader('Cache-Control', 'no-store');
    if (req.path === '/generation/events') {
      const close = () => res.end();
      const untrack = authService.trackStream(session.tokenHash, close);
      const timer = setTimeout(close, Math.max(0, session.expiresAt - Date.now()));
      timer.unref();
      res.on('close', () => { clearTimeout(timer); untrack(); });
      // Recheck after registering so revocation between lookup and registration
      // cannot leave a stream active.
      if (!await authService.session(readAdminCookie(req))) { close(); return; }
    }
    next();
  } catch (err) { next(err); }
}
