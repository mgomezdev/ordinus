import { eq } from 'drizzle-orm';
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
  const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Customer not found');
  }
  // layouts.customer_id will be set to NULL via ON DELETE SET NULL
  // customer_parts and customer_ref_images will cascade delete
  await db.delete(customers).where(eq(customers.id, id));
}

export async function getCustomerParts(customerId: number): Promise<typeof userStlUploads.$inferSelect[]> {
  const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Customer not found');
  }
  const rows = await db
    .select({ part: userStlUploads })
    .from(customerParts)
    .innerJoin(userStlUploads, eq(customerParts.partId, userStlUploads.id))
    .where(eq(customerParts.customerId, customerId));
  return rows.map(r => r.part);
}

export async function associatePart(customerId: number, partId: string): Promise<void> {
  const customerExists = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (customerExists.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Customer not found');
  }
  const partExists = await db.select({ id: userStlUploads.id }).from(userStlUploads).where(eq(userStlUploads.id, partId)).limit(1);
  if (partExists.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Part not found');
  }
  try {
    await db.insert(customerParts).values({ customerId, partId });
  } catch {
    // Already associated — ignore
  }
}

export async function dissociatePart(customerId: number, partId: string): Promise<void> {
  const { client } = await import('../db/connection.js');
  await client.execute({
    sql: `DELETE FROM customer_parts WHERE customer_id = ? AND part_id = ?`,
    args: [customerId, partId],
  });
}

export async function getCustomerRefImages(customerId: number): Promise<typeof refImages.$inferSelect[]> {
  const existing = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (existing.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Customer not found');
  }
  const rows = await db
    .select({ refImage: refImages })
    .from(customerRefImages)
    .innerJoin(refImages, eq(customerRefImages.refImageId, refImages.id))
    .where(eq(customerRefImages.customerId, customerId));
  return rows.map(r => r.refImage);
}

export async function associateRefImage(customerId: number, refImageId: number): Promise<void> {
  const customerExists = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (customerExists.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Customer not found');
  }
  const imgExists = await db.select({ id: refImages.id }).from(refImages).where(eq(refImages.id, refImageId)).limit(1);
  if (imgExists.length === 0) {
    throw new AppError(ErrorCodes.NOT_FOUND, 'Reference image not found');
  }
  try {
    await db.insert(customerRefImages).values({ customerId, refImageId });
  } catch {
    // Already associated — ignore
  }
}

export async function dissociateRefImage(customerId: number, refImageId: number): Promise<void> {
  const { client } = await import('../db/connection.js');
  await client.execute({
    sql: `DELETE FROM customer_ref_images WHERE customer_id = ? AND ref_image_id = ?`,
    args: [customerId, refImageId],
  });
}
