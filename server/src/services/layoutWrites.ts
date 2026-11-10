import { AppError, ErrorCodes } from '@gridfinity/shared';
export function checkLiveGeometry(gridX: number, gridY: number, bins: Array<{ x: number; y: number; width: number; height: number }>): void {
  const invalid = (message: string) => new AppError(ErrorCodes.VALIDATION_ERROR, message);
  if (bins.length > 200) throw invalid('A drawer can contain at most 200 bins');
  for (let i = 0; i < bins.length; i++) {
    const a = bins[i];
    if (![a.x, a.y, a.width, a.height].every(Number.isInteger) || a.x < 0 || a.y < 0 || a.width < 1 || a.height < 1 || a.x + a.width > gridX * 2 || a.y + a.height > gridY * 2) throw invalid('A bin would be outside the drawer. Move or remove it first.');
    for (const b of bins.slice(i + 1)) if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) throw invalid('Bins cannot overlap. Choose a free position.');
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
