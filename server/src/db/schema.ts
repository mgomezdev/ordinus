import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  baseModelPath: text('base_model_path'),
  parameters: text('parameters'),
});

export const libraryItems = sqliteTable('library_items', {
  libraryId: text('library_id').notNull().references(() => libraries.id),
  id: text('id').notNull(),
  name: text('name').notNull(),
  widthUnits: integer('width_units').notNull(),
  heightUnits: integer('height_units').notNull(),
  color: text('color').notNull().default('#3B82F6'),
  imagePath: text('image_path'),
  perspectiveImagePath: text('perspective_image_path'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  stlFile: text('stl_file'),
  paramHash: text('param_hash'),
}, (table) => [
  primaryKey({ columns: [table.libraryId, table.id] }),
]);

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const itemCategories = sqliteTable('item_categories', {
  libraryId: text('library_id').notNull(),
  itemId: text('item_id').notNull(),
  categoryId: text('category_id').notNull().references(() => categories.id),
}, (table) => [
  primaryKey({ columns: [table.libraryId, table.itemId, table.categoryId] }),
]);

// Auth tables — kept for backward compat, no longer actively used
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
});

export const refreshTokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  familyId: text('family_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  isRevoked: integer('is_revoked', { mode: 'boolean' }).notNull().default(false),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(''),
}, (table) => [
  index('idx_refresh_tokens_family').on(table.familyId),
  index('idx_refresh_tokens_user').on(table.userId),
]);

// Customer profiles
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
});

// Many-to-many: custom STL uploads <-> customers
export const customerParts = sqliteTable('customer_parts', {
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  partId: text('part_id').notNull().references(() => userStlUploads.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.customerId, table.partId] }),
]);

// Many-to-many: ref images <-> customers
export const customerRefImages = sqliteTable('customer_ref_images', {
  customerId: integer('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  refImageId: integer('ref_image_id').notNull().references(() => refImages.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.customerId, table.refImageId] }),
]);

// Layout tables
export const layouts = sqliteTable('layouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),  // nullable — no longer enforced
  customerId: integer('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  gridX: integer('grid_x').notNull(),
  gridY: integer('grid_y').notNull(),
  widthMm: real('width_mm').notNull(),
  depthMm: real('depth_mm').notNull(),
  spacerHorizontal: text('spacer_horizontal').notNull().default('none'),
  spacerVertical: text('spacer_vertical').notNull().default('none'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  thumbnailPath: text('thumbnail_path'),
}, (table) => [
  index('idx_layouts_user').on(table.userId),
  index('idx_layouts_customer').on(table.customerId),
]);

export const placedItems = sqliteTable('placed_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  layoutId: integer('layout_id').notNull().references(() => layouts.id, { onDelete: 'cascade' }),
  libraryId: text('library_id').notNull(),
  itemId: text('item_id').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  rotation: integer('rotation').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  customization: text('customization'),
}, (table) => [
  index('idx_placed_items_layout').on(table.layoutId),
]);

export const userStorage = sqliteTable('user_storage', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  layoutCount: integer('layout_count').notNull().default(0),
  imageBytes: integer('image_bytes').notNull().default(0),
  maxLayouts: integer('max_layouts').notNull().default(50),
  maxImageBytes: integer('max_image_bytes').notNull().default(52428800),
  maxUserStls: integer('max_user_stls').notNull().default(50),
});

export const userStlUploads = sqliteTable('user_stl_uploads', {
  id: text('id').primaryKey(),
  userId: integer('user_id'),  // nullable — parts are now global
  name: text('name').notNull(),
  originalFilename: text('original_filename').notNull(),
  filePath: text('file_path').notNull(),
  imageUrl: text('image_url'),
  perspImageUrls: text('persp_image_urls'), // JSON array string
  gridX: integer('grid_x'),
  gridY: integer('grid_y'),
  gridZ: integer('grid_z'),
  visibility: text('visibility').notNull().default('private'),
  status: text('status').notNull().default('pending'), // 'pending'|'processing'|'ready'|'error'
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
});

// Reference image library table — global, no user ownership
export const refImages = sqliteTable('ref_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
});

// Reference image placements table (per-layout)
export const referenceImages = sqliteTable('reference_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  layoutId: integer('layout_id').notNull().references(() => layouts.id, { onDelete: 'cascade' }),
  refImageId: integer('ref_image_id').references(() => refImages.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  x: real('x').notNull().default(10),
  y: real('y').notNull().default(10),
  width: real('width').notNull().default(50),
  height: real('height').notNull().default(50),
  opacity: real('opacity').notNull().default(0.5),
  scale: real('scale').notNull().default(1.0),
  isLocked: integer('is_locked', { mode: 'boolean' }).notNull().default(false),
  rotation: integer('rotation').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
}, (table) => [
  index('idx_reference_images_layout').on(table.layoutId),
]);

// Sharing tables — open sharing, no user FK
export const sharedProjects = sqliteTable('shared_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  layoutId: integer('layout_id').notNull().references(() => layouts.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  createdBy: integer('created_by'),  // nullable — no user ownership
  expiresAt: text('expires_at'),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: text('created_at').notNull().default(''),
}, (table) => [
  index('idx_shared_projects_slug').on(table.slug),
]);

// BOM tables
export const bomGenerations = sqliteTable('bom_generations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  layoutId: integer('layout_id').notNull().unique().references(() => layouts.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'),
  exportJson: text('export_json'),
  fileManifest: text('file_manifest'),
  threeMfPath: text('three_mf_path'),
  generatedAt: text('generated_at'),
  errorMessage: text('error_message'),
  themisProjectId: integer('themis_project_id'),
});

// Favorites — global, no user ownership
export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  userId: integer('user_id'),  // nullable — kept for compat but not used
  name: text('name').notNull(),
  libraryId: text('library_id').notNull(),
  libraryItemId: text('library_item_id').notNull(),
  libraryItemName: text('library_item_name').notNull(),
  widthUnits: integer('width_units').notNull(),
  heightUnits: integer('height_units').notNull(),
  color: text('color').notNull().default('#3B82F6'),
  paramHash: text('param_hash'),
  imageUrl: text('image_url').notNull().default(''),
  perspectiveImageUrl: text('perspective_image_url'),
  perspectiveImageUrl90: text('perspective_image_url90'),
  perspectiveImageUrl180: text('perspective_image_url180'),
  perspectiveImageUrl270: text('perspective_image_url270'),
  customization: text('customization').notNull(),
  createdAt: integer('created_at').notNull(),
});

// Relations
export const librariesRelations = relations(libraries, ({ many }) => ({
  items: many(libraryItems),
}));

export const libraryItemsRelations = relations(libraryItems, ({ one, many }) => ({
  library: one(libraries, {
    fields: [libraryItems.libraryId],
    references: [libraries.id],
  }),
  itemCategories: many(itemCategories),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  itemCategories: many(itemCategories),
}));

export const itemCategoriesRelations = relations(itemCategories, ({ one }) => ({
  category: one(categories, {
    fields: [itemCategories.categoryId],
    references: [categories.id],
  }),
  item: one(libraryItems, {
    fields: [itemCategories.libraryId, itemCategories.itemId],
    references: [libraryItems.libraryId, libraryItems.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  layouts: many(layouts),
  customerParts: many(customerParts),
  customerRefImages: many(customerRefImages),
}));

export const customerPartsRelations = relations(customerParts, ({ one }) => ({
  customer: one(customers, {
    fields: [customerParts.customerId],
    references: [customers.id],
  }),
  part: one(userStlUploads, {
    fields: [customerParts.partId],
    references: [userStlUploads.id],
  }),
}));

export const customerRefImagesRelations = relations(customerRefImages, ({ one }) => ({
  customer: one(customers, {
    fields: [customerRefImages.customerId],
    references: [customers.id],
  }),
  refImage: one(refImages, {
    fields: [customerRefImages.refImageId],
    references: [refImages.id],
  }),
}));

export const layoutsRelations = relations(layouts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [layouts.customerId],
    references: [customers.id],
  }),
  placedItems: many(placedItems),
  referenceImages: many(referenceImages),
}));

export const refImagesRelations = relations(refImages, ({ many }) => ({
  customerRefImages: many(customerRefImages),
}));

export const referenceImagesRelations = relations(referenceImages, ({ one }) => ({
  layout: one(layouts, {
    fields: [referenceImages.layoutId],
    references: [layouts.id],
  }),
  refImage: one(refImages, {
    fields: [referenceImages.refImageId],
    references: [refImages.id],
  }),
}));

export const placedItemsRelations = relations(placedItems, ({ one }) => ({
  layout: one(layouts, {
    fields: [placedItems.layoutId],
    references: [layouts.id],
  }),
}));

export const userStorageRelations = relations(userStorage, ({ one }) => ({
  user: one(users, {
    fields: [userStorage.userId],
    references: [users.id],
  }),
}));

export const sharedProjectsRelations = relations(sharedProjects, ({ one }) => ({
  layout: one(layouts, {
    fields: [sharedProjects.layoutId],
    references: [layouts.id],
  }),
}));

export const bomGenerationsRelations = relations(bomGenerations, ({ one }) => ({
  layout: one(layouts, {
    fields: [bomGenerations.layoutId],
    references: [layouts.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ }) => ({
}));

export const userStlUploadsRelations = relations(userStlUploads, ({ many }) => ({
  customerParts: many(customerParts),
}));
