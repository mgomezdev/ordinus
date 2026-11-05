import { and, eq } from 'drizzle-orm';
import { AppError, ErrorCodes } from '@gridfinity/shared';
import { db } from '../db/connection.js';
import { customers, customerParts, customerRefImages, userStlUploads, refImages } from '../db/schema.js';

export interface ApiCustomer {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function formatCustomer(row: typeof customers.$inferSelect): ApiCustomer {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertExists(
  table: typeof customers | typeof userStlUploads | typeof refImages,
  id: number | string,
  label: string,
): Promise<void> {
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, `${label} not found`);
  }
}

const assertCustomerExists = (id: number) => assertExists(customers, id, 'Customer');

export async function listCustomers(): Promise<ApiCustomer[]> {
  const rows = await db.select().from(customers).orderBy(customers.name);
  return rows.map(formatCustomer);
}

export async function createCustomer(name: string): Promise<ApiCustomer> {
  const now = new Date().toISOString();
  const rows = await db
    .insert(customers)
    .values({ name, createdAt: now, updatedAt: now })
    .returning();
  return formatCustomer(rows[0]);
}

export async function updateCustomer(id: number, name: string): Promise<ApiCustomer> {
  const now = new Date().toISOString();
  const rows = await db
    .update(customers)
    .set({ name, updatedAt: now })
    .where(eq(customers.id, id))
    .returning();
  if (rows.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Customer not found');
  }
  return formatCustomer(rows[0]);
}

export async function deleteCustomer(id: number): Promise<void> {
  await assertCustomerExists(id);
  // layouts.customer_id will be set to NULL via ON DELETE SET NULL
  // customer_parts and customer_ref_images will cascade delete
  await db.delete(customers).where(eq(customers.id, id));
}

export async function getCustomerParts(customerId: number): Promise<typeof userStlUploads.$inferSelect[]> {
  await assertCustomerExists(customerId);
  const rows = await db
    .select({ part: userStlUploads })
    .from(customerParts)
    .innerJoin(userStlUploads, eq(customerParts.partId, userStlUploads.id))
    .where(eq(customerParts.customerId, customerId));
  return rows.map(r => r.part);
}

export async function associatePart(customerId: number, partId: string): Promise<void> {
  await assertCustomerExists(customerId);
  await assertExists(userStlUploads, partId, 'Part');
  await db.insert(customerParts).values({ customerId, partId }).onConflictDoNothing();
}

export async function dissociatePart(customerId: number, partId: string): Promise<void> {
  await db
    .delete(customerParts)
    .where(and(eq(customerParts.customerId, customerId), eq(customerParts.partId, partId)));
}

export async function getCustomerRefImages(customerId: number): Promise<typeof refImages.$inferSelect[]> {
  await assertCustomerExists(customerId);
  const rows = await db
    .select({ refImage: refImages })
    .from(customerRefImages)
    .innerJoin(refImages, eq(customerRefImages.refImageId, refImages.id))
    .where(eq(customerRefImages.customerId, customerId));
  return rows.map(r => r.refImage);
}

export async function associateRefImage(customerId: number, refImageId: number): Promise<void> {
  await assertCustomerExists(customerId);
  await assertExists(refImages, refImageId, 'Reference image');
  await db.insert(customerRefImages).values({ customerId, refImageId }).onConflictDoNothing();
}

export async function dissociateRefImage(customerId: number, refImageId: number): Promise<void> {
  await db
    .delete(customerRefImages)
    .where(and(eq(customerRefImages.customerId, customerId), eq(customerRefImages.refImageId, refImageId)));
}
