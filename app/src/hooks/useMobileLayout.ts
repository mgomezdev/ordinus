import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../utils/storageKeys';

const MOBILE_BREAKPOINT = 1024;

interface MobileLayoutState {
  libraryOpen: boolean;
  settingsOpen: boolean;
}

const DEFAULT_STATE: MobileLayoutState = { libraryOpen: false, settingsOpen: false };

function loadState(): MobileLayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MOBILE_LAYOUT);
    return raw ? (JSON.parse(raw) as MobileLayoutState) : DEFAULT_STATE;
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: MobileLayoutState): void {
  localStorage.setItem(STORAGE_KEYS.MOBILE_LAYOUT, JSON.stringify(state));
}

export interface UseMobileLayoutReturn {
  isMobile: boolean;
  libraryOpen: boolean;
  settingsOpen: boolean;
  toggleLibrary: () => void;
  toggleSettings: () => void;
  closeLibrary: () => void;
  closeSettings: () => void;
}

export function useMobileLayout(): UseMobileLayoutReturn {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches,
  );
  const [panelState, setPanelState] = useState<MobileLayoutState>(loadState);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleLibrary = useCallback(() => {
    setPanelState(prev => {
      const next: MobileLayoutState = { libraryOpen: !prev.libraryOpen, settingsOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  const toggleSettings = useCallback(() => {
    setPanelState(prev => {
      const next: MobileLayoutState = { settingsOpen: !prev.settingsOpen, libraryOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  const closeLibrary = useCallback(() => {
    setPanelState(prev => {
      if (!prev.libraryOpen) return prev;
      const next: MobileLayoutState = { ...prev, libraryOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  const closeSettings = useCallback(() => {
    setPanelState(prev => {
      if (!prev.settingsOpen) return prev;
      const next: MobileLayoutState = { ...prev, settingsOpen: false };
      saveState(next);
      return next;
    });
  }, []);

  return {
    isMobile,
    libraryOpen: panelState.libraryOpen,
    settingsOpen: panelState.settingsOpen,
    toggleLibrary,
    toggleSettings,
    closeLibrary,
    closeSettings,
  };
}
