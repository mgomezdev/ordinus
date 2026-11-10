import type { GuestPreview } from './guestPreview.js';
export interface LiveCatalogItem { key: string; name: string; width: number; depth: number }
export interface LiveBin { id: number; stableId: string; customizable: boolean; height: number; lipStyle: string; wallPatternEnabled: boolean }
export interface LiveSnapshot {
  revision: number;
  layout: GuestPreview;
  bins: LiveBin[];
  catalog: LiveCatalogItem[];
  participants: Array<{ id: string; name: string; role: 'owner' | 'guest' }>;
}
export type LiveChange =
  | { type: 'add'; catalogKey: string; x: number; y: number }
  | { type: 'move'; stableId: string; x: number; y: number }
  | { type: 'rotate'; stableId: string; direction: 'cw' | 'ccw' }
  | { type: 'remove'; stableId: string }
  | { type: 'customize'; stableId: string; height: number; lipStyle: 'normal' | 'reduced' | 'minimum' | 'none'; wallPatternEnabled: boolean }
  | { type: 'drawer'; widthMm: number; depthMm: number; spacerHorizontal: 'none' | 'one-sided' | 'symmetrical'; spacerVertical: 'none' | 'one-sided' | 'symmetrical' };
export interface LiveCommand { commandId: string; baseRevision: number; change: LiveChange }
