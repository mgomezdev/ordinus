import type { GuestPreview } from './guestPreview.js';
export interface LiveCatalogItem { key: string; name: string; width: number; depth: number; snapStep?: number; libraryName?: string }
export interface LiveBin { id: number; stableId: string; customizable: boolean; height: number; heightStep?: number; lipStyle: string; wallPatternEnabled: boolean; snapStep?: number }
export interface LiveSnapshot {
  revision: number;
  layout: GuestPreview;
  bins: LiveBin[];
  catalog: LiveCatalogItem[];
  participants: Array<{ id: string; name: string; role: 'owner' | 'guest' }>;
}
export type LivePlacementChange =
  | { type: 'move'; stableId: string; x: number; y: number }
  | { type: 'rotate'; stableId: string; direction: 'cw' | 'ccw' }
  | { type: 'remove'; stableId: string }
  | { type: 'duplicate'; stableId: string; x: number; y: number };
export type LiveChange = LivePlacementChange
  | { type: 'batch'; changes: LivePlacementChange[] }
  | { type: 'add'; catalogKey: string; x: number; y: number }
  | { type: 'customize'; stableId: string; height: number; lipStyle: 'normal' | 'reduced' | 'minimum' | 'none'; wallPatternEnabled: boolean }
  | { type: 'drawer'; widthMm: number; depthMm: number; spacerHorizontal: 'none' | 'one-sided' | 'symmetrical'; spacerVertical: 'none' | 'one-sided' | 'symmetrical' };
export interface LiveCommand { commandId: string; baseRevision: number; change: LiveChange }
