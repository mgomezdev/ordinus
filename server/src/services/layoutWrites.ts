import { AppError, ErrorCodes } from '@gridfinity/shared';
export function checkLiveGeometry(gridX: number, gridY: number, bins: Array<{ x: number; y: number; width: number; height: number }>): void {
  const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_ERROR, message);
  if (bins.length > 200) throw invalid('A drawer can contain at most 200 bins');
  if (![gridX, gridY].every(value => Number.isInteger(value) && value >= 1 && value <= 20)) throw invalid('Invalid drawer grid');
  // Placement validity is visible editing feedback, just as in the workspace.
  // Keep overlapping / overflowing drafts editable, while bounding stored data.
  for (const a of bins) {
    if (![a.x, a.y, a.width, a.height].every(Number.isInteger) || a.x < 0 || a.y < 0 || a.x > 40 || a.y > 40 || a.width < 1 || a.height < 1 || a.width > 40 || a.height > 40) throw invalid('Bin coordinates and dimensions must be valid half-cell values');
  }
}
// One writer at a time on the shared SQLite connection. The database transaction
// remains the cross-process boundary; this prevents awaits interleaving locally.
let pending: Promise<unknown> = Promise.resolve();
export function layoutWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = pending.then(work, work);
  pending = result.catch(() => {});
  return result;
}
type Listener = () => void;
const listeners = new Map<number, Set<Listener>>();
export function layoutChanged(id: number): void { listeners.get(id)?.forEach(listener => listener()); }
export function watchLayout(id: number, listener: Listener): () => void {
  const set = listeners.get(id) ?? new Set<Listener>();
  set.add(listener); listeners.set(id, set);
  return () => { set.delete(listener); if (!set.size) listeners.delete(id); };
}
