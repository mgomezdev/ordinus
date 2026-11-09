/** Deliberately excludes customer records, operator notes, and global asset paths. */
export interface GuestPreview {
  name: string;
  gridX: number;
  gridY: number;
  gridResolution: number;
  widthMm: number;
  depthMm: number;
  spacerHorizontal: string;
  spacerVertical: string;
  savedAt: string;
  bins: Array<{ id: number; name: string; x: number; y: number; width: number; depth: number; rotation: number; heightUnits: number | null }>;
  referenceImages: Array<{ id: number; name: string; url: string; x: number; y: number; width: number; height: number; opacity: number; scale: number; rotation: number; isAligned: boolean }>;
}

export interface GuestLink {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
export interface GuestPreviewResponse { layout: GuestPreview; expiresAt: string }
