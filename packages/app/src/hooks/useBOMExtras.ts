import { useState, useCallback } from 'react';
import type { BOMExtras } from '../types/gridfinity';
import { STORAGE_KEYS } from '../utils/storageKeys';

function loadExtras(): BOMExtras {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BOM_EXTRAS);
    return raw ? (JSON.parse(raw) as BOMExtras) : {};
  } catch {
    return {};
  }
}

function saveExtras(extras: BOMExtras): void {
  localStorage.setItem(STORAGE_KEYS.BOM_EXTRAS, JSON.stringify(extras));
}

export interface UseBOMExtrasReturn {
  extras: BOMExtras;
  addExtra: (key: string) => void;
  setExtraQty: (key: string, qty: number) => void;
  removeExtra: (key: string) => void;
  clearExtras: () => void;
}

export function useBOMExtras(): UseBOMExtrasReturn {
  const [extras, setExtras] = useState<BOMExtras>(loadExtras);

  const addExtra = useCallback((key: string) => {
    setExtras(prev => {
      if (key in prev) return prev;
      const next = { ...prev, [key]: 1 };
      saveExtras(next);
      return next;
    });
  }, []);

  const setExtraQty = useCallback((key: string, qty: number) => {
    setExtras(prev => {
      const next = { ...prev, [key]: qty };
      saveExtras(next);
      return next;
    });
  }, []);

  const removeExtra = useCallback((key: string) => {
    setExtras(prev => {
      const next = { ...prev };
      delete next[key];
      saveExtras(next);
      return next;
    });
  }, []);

  const clearExtras = useCallback(() => {
    setExtras(() => {
      localStorage.removeItem(STORAGE_KEYS.BOM_EXTRAS);
      return {};
    });
  }, []);

  return { extras, addExtra, setExtraQty, removeExtra, clearExtras };
}
