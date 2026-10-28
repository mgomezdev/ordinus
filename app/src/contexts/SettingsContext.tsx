import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getSettings, getServicesHealth, patchSettings } from '../api/settings.api.js';
import type { ServiceSettings, ServicesHealth } from '../api/settings.api.js';

interface SettingsContextValue {
  settings: ServiceSettings;
  health: ServicesHealth;
  saveSettings: (patch: Partial<ServiceSettings>) => Promise<void>;
  refreshHealth: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: { themis_url: '', themis_api_key: '', laminus_url: '' },
  health: { themis: 'unconfigured', laminus: 'unconfigured' },
  saveSettings: async () => {},
  refreshHealth: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ServiceSettings>({ themis_url: '', themis_api_key: '', laminus_url: '' });
  const [health, setHealth] = useState<ServicesHealth>({ themis: 'unconfigured', laminus: 'unconfigured' });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function pollHealth() {
    getServicesHealth().then(setHealth).catch(() => { /* ignore */ });
  }

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
    pollHealth();
    intervalRef.current = setInterval(pollHealth, 15000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  async function saveSettings(patch: Partial<ServiceSettings>) {
    await patchSettings(patch);
    setSettings(prev => ({ ...prev, ...patch }));
    pollHealth();
  }

  return (
    <SettingsContext.Provider value={{ settings, health, saveSettings, refreshHealth: pollHealth }}>
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() { return useContext(SettingsContext); }
