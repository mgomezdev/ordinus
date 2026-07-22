export interface ServiceSettings {
  themis_url: string;
  laminus_url: string;
}

export type ServiceStatus = 'up' | 'down' | 'unconfigured';

export interface ServicesHealth {
  themis: ServiceStatus;
  laminus: ServiceStatus;
}

export async function getSettings(): Promise<ServiceSettings> {
  const res = await fetch('/api/v1/settings');
  if (!res.ok) throw new Error('Failed to load settings');
  return res.json() as Promise<ServiceSettings>;
}

export async function patchSettings(patch: Partial<ServiceSettings>): Promise<void> {
  const res = await fetch('/api/v1/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to save settings');
}

export async function getServicesHealth(): Promise<ServicesHealth> {
  const res = await fetch('/api/v1/settings/health');
  if (!res.ok) throw new Error('Failed to check health');
  return res.json() as Promise<ServicesHealth>;
}
