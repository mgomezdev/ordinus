import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSetting, setSetting } from '../services/settings.service.js';

const router = Router();

async function checkHealth(url: string, path: string): Promise<'up' | 'down'> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${url}${path}`, { signal: controller.signal });
    return res.ok ? 'up' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timeout);
  }
}

router.get('/settings', async (_req: Request, res: Response) => {
  const [themis_url, laminus_url] = await Promise.all([
    getSetting('themis_url'),
    getSetting('laminus_url'),
  ]);
  res.json({ themis_url, laminus_url });
});

router.patch('/settings', async (req: Request, res: Response) => {
  const body = req.body as { themis_url?: string; laminus_url?: string };
  const ops: Promise<void>[] = [];
  if (body.themis_url !== undefined) ops.push(setSetting('themis_url', body.themis_url));
  if (body.laminus_url !== undefined) ops.push(setSetting('laminus_url', body.laminus_url));
  await Promise.all(ops);
  res.status(204).end();
});

router.get('/settings/health', async (_req: Request, res: Response) => {
  type Status = 'up' | 'down' | 'unconfigured';
  const [themis_url, laminus_url] = await Promise.all([getSetting('themis_url'), getSetting('laminus_url')]);
  const [themis, laminus]: [Status, Status] = await Promise.all([
    themis_url ? checkHealth(themis_url, '/api/v1/health') : Promise.resolve<Status>('unconfigured'),
    laminus_url ? checkHealth(laminus_url, '/api/health') : Promise.resolve<Status>('unconfigured'),
  ]);
  res.json({ themis, laminus });
});

export default router;
