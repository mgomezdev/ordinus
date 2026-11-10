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
