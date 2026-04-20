import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { userStorage } from '../db/schema.js';

export async function ensureStorageRow(userId: number): Promise<typeof userStorage.$inferSelect> {
  const existing = await db
    .select()
    .from(userStorage)
    .where(eq(userStorage.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const inserted = await db
    .insert(userStorage)
    .values({ userId, layoutCount: 0, imageBytes: 0 })
    .returning();

  return inserted[0];
}
