import type { ApiLayout } from '@gridfinity/shared';

export type GroupMode = 'none' | 'owner' | 'lastEdited';

export interface LayoutGroup {
  label: string;
  layouts: ApiLayout[];
}

const TIME_BUCKETS = ['Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'Older'] as const;

function getTimeBucket(updatedAt: string, now: Date): string {
  const date = new Date(updatedAt);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  if (date >= todayStart) return 'Today';
  if (date >= yesterdayStart) return 'Yesterday';
  if (date >= sevenDaysAgo) return 'Last 7 Days';
  if (date >= thirtyDaysAgo) return 'Last 30 Days';
  return 'Older';
}

export function groupLayouts(
  layouts: ApiLayout[],
  mode: GroupMode,
  now: Date = new Date(),
): LayoutGroup[] {
  if (mode === 'none') {
    return [{ label: 'All', layouts }];
  }

  if (mode === 'owner') {
    const map = new Map<string, ApiLayout[]>();
    for (const layout of layouts) {
      const key = layout.ownerUsername ?? 'Unknown';
      const group = map.get(key);
      if (group) {
        group.push(layout);
      } else {
        map.set(key, [layout]);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return a.localeCompare(b);
      })
      .map(([label, items]) => ({ label, layouts: items }));
  }

  // lastEdited
  const bucketMap = new Map<string, ApiLayout[]>();
  for (const layout of layouts) {
    const bucket = getTimeBucket(layout.updatedAt, now);
    const group = bucketMap.get(bucket);
    if (group) {
      group.push(layout);
    } else {
      bucketMap.set(bucket, [layout]);
    }
  }

  return TIME_BUCKETS
    .filter(bucket => bucketMap.has(bucket))
    .map(bucket => ({ label: bucket, layouts: bucketMap.get(bucket)! }));
}
