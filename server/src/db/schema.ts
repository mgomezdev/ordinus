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

// Auth tables
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

// Layout tables
export const layouts = sqliteTable('layouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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

export const userStlUploadsRelations = relations(userStlUploads, ({ one }) => ({
  user: one(users, {
    fields: [userStlUploads.userId],
    references: [users.id],
  }),
}));

// Reference image library table
export const refImages = sqliteTable('ref_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull().default(0),
  uploadedBy: integer('uploaded_by').notNull().references(() => users.id),
  createdAt: text('created_at').notNull().default(''),
}, (table) => [
  index('idx_ref_images_owner').on(table.ownerId),
]);

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

// Sharing tables
export const sharedProjects = sqliteTable('shared_projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  layoutId: integer('layout_id').notNull().references(() => layouts.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull().unique(),
  createdBy: integer('created_by').notNull().references(() => users.id),
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

export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
}, (table) => [
  index('idx_favorites_user').on(table.userId),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  layouts: many(layouts),
  stlUploads: many(userStlUploads),
  favorites: many(favorites),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

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

export const layoutsRelations = relations(layouts, ({ one, many }) => ({
  user: one(users, {
    fields: [layouts.userId],
    references: [users.id],
  }),
  placedItems: many(placedItems),
  referenceImages: many(referenceImages),
}));

export const refImagesRelations = relations(refImages, ({ one }) => ({
  owner: one(users, {
    fields: [refImages.ownerId],
    references: [users.id],
  }),
  uploader: one(users, {
    fields: [refImages.uploadedBy],
    references: [users.id],
  }),
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
  creator: one(users, {
    fields: [sharedProjects.createdBy],
    references: [users.id],
  }),
}));

export const bomGenerationsRelations = relations(bomGenerations, ({ one }) => ({
  layout: one(layouts, {
    fields: [bomGenerations.layoutId],
    references: [layouts.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, {
    fields: [favorites.userId],
    references: [users.id],
  }),
}));
