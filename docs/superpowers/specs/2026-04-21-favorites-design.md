# Favorites Feature Design

## Overview

Users can save a placed item (with its current customization) as a favorite. Favorites are stored server-side per user, accessible from any session. The Favorites library tab appears leftmost in the library panel (auth-gated). A heart icon in the placed item toolbar toggles favorite status.

Favorites are immutable snapshots — changing a placed item's customization after favoriting does not update the favorite. The placed item and the favorite are independent after creation.

---

## Data Model

### `favorites` table (drizzle schema)

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `userId` | text FK | bound to authenticated user |
| `name` | text | user-editable, auto-generated on creation |
| `libraryId` | text | snapshot |
| `libraryItemId` | text | snapshot |
| `libraryItemName` | text | snapshot for display |
| `widthUnits` | integer | snapshot |
| `heightUnits` | integer | snapshot |
| `color` | text | snapshot |
| `paramHash` | text nullable | for generated image lookup |
| `imageUrl` | text | fallback image snapshot |
| `perspectiveImageUrl` | text nullable | snapshot |
| `perspectiveImageUrl90` | text nullable | snapshot |
| `perspectiveImageUrl180` | text nullable | snapshot |
| `perspectiveImageUrl270` | text nullable | snapshot |
| `customization` | text | JSON-serialized `BinCustomization` snapshot |
| `createdAt` | integer | ms timestamp |

### `FavoriteItem` frontend type (`src/types/gridfinity.ts`)

```typescript
export interface FavoriteItem {
  id: string;
  name: string;
  createdAt: number;
  libraryId: string;
  libraryItemId: string;
  libraryItemName: string;
  widthUnits: number;
  heightUnits: number;
  color: string;
  paramHash: string | null;
  imageUrl: string;
  perspectiveImageUrl: string | null;
  perspectiveImageUrl90: string | null;
  perspectiveImageUrl180: string | null;
  perspectiveImageUrl270: string | null;
  customization: BinCustomization;
}
```

### Auto-name generation

- No wall pattern enabled: `{libraryItemName}`
- Wall pattern enabled: `{libraryItemName} ({wallPattern})` (e.g. `Bin 2×3×7 (voronoi)`)
- Wall pattern not enabled but non-default lip style: `{libraryItemName} ({lipStyle})`

---

## API Endpoints

All routes require auth middleware. `DELETE` and `PATCH` verify `favorite.userId === req.user.id` (403 otherwise).

```
GET    /api/v1/favorites          — list authenticated user's favorites
POST   /api/v1/favorites          — create favorite (body: FavoriteItem fields minus id/createdAt)
DELETE /api/v1/favorites/:id      — remove favorite
PATCH  /api/v1/favorites/:id/name — rename favorite (body: { name: string })
```

---

## Frontend

### `useFavorites` hook (`src/hooks/useFavorites.ts`)

```typescript
interface UseFavoritesReturn {
  favorites: FavoriteItem[];
  isLoading: boolean;
  isFavorite: (libraryItemId: string, customization: BinCustomization) => boolean;
  toggleFavorite: (
    libraryItem: LibraryItem,
    customization: BinCustomization,
    paramHash: string | null
  ) => void;
  removeFavorite: (favoriteId: string) => void;
  renameFavorite: (favoriteId: string, name: string) => void;
}
```

- Backed by TanStack Query (`useQuery` for fetch, `useMutation` for writes)
- `useQuery` only runs when authenticated
- `isFavorite` matches by `libraryItemId` + deep-equal `customization`
- `toggleFavorite` adds if not favorited, removes if already favorited
- Mutations use optimistic updates; roll back on error
- When unauthenticated: returns `favorites: []`, `isLoading: false`, no-op mutations

### Heart button in `PlacedItemOverlay`

- Leftmost position in toolbar (before CCW rotation button)
- Calls `isFavorite(item.itemId, item.customization ?? defaultCustomization)` for state
- `onClick` calls `toggleFavorite(libraryItem, customization, paramHash)`
- Renders `♡` (white border, no fill) when not favorited
- Renders `♥` (pink border + pink fill) when favorited
- Only rendered for authenticated users

### Favorites tab in `LibraryPanel`

- Hardcoded tab rendered before all library tabs; hidden when unauthenticated
- Tab label: ♥ heart icon
- Selected tab state extended: `'favorites' | 'items' | 'images'`
- When active: renders a `FavoriteCard` grid

### `FavoriteCard` component (`src/components/FavoriteCard.tsx`)

- Image: `generatedImageUrl(paramHash, 'ortho.png')` if `paramHash` present, else `imageUrl` fallback
- Always-visible trash icon (top-right corner) → calls `onRemove`
- Name: double-click (desktop) or 500ms long-press (touch) → inline `<input>` → Enter or blur saves via `onRename`; Escape cancels
- Draggable: `dragstart` sets `dataTransfer` to `favorite:${fav.id}`

### Drag-drop integration

- Existing drop handler in `GridPreview` parses `libraryId:itemId` format
- New branch: if dropped ID starts with `favorite:`, look up `FavoriteItem` from favorites state
- Constructs `PlacedItem` from snapshot: `itemId = libraryItemId`, `customization`, `widthUnits`, `heightUnits`, `color`
- The placed item is a value copy — fully independent of the `FavoriteItem` after creation

### Generation compatibility

When a placed item created from a favorite is sent to STL/3MF generation:
- Sends `{ libraryId, itemId, customization }` from the placed item's own fields
- Server merges global defaults + library base params + `BinCustomization` as normal
- No changes required to the generation pipeline

---

## Key Behavioral Rules

- **Favorites are snapshots**: favoriting captures `BinCustomization` at that moment; subsequent customization changes on the placed item do not affect the favorite
- **Placed items are independent**: removing a favorite does not affect any placed items created from it; the placed item retains its `customization` and generation works unchanged; the heart shows empty to reflect the favorite no longer exists
- **Auth-gated**: favorites tab and heart button are hidden for unauthenticated users

---

## Testing

### Unit — `useFavorites` hook

- `isFavorite` returns `true`/`false` correctly for matching/non-matching customizations
- `toggleFavorite` calls create mutation when not favorited, delete mutation when already favorited
- `removeFavorite` and `renameFavorite` call correct mutations
- Returns empty state and no-ops when unauthenticated
- Optimistic updates roll back on mutation error

### Unit — `FavoriteCard`

- Renders name and trash icon
- Double-click on name activates inline input; Enter saves; Escape cancels
- 500ms long-press activates inline input on touch
- Trash icon click calls `onRemove`
- Drag sets `dataTransfer` to `favorite:${id}`

### Server

- `GET /favorites` returns only the authenticated user's favorites (not other users')
- `DELETE /favorites/:id` returns 403 when favorite belongs to a different user
- `POST /favorites` validates request body via zod schema

### E2E

- User logs in → places a library item → customizes it → clicks heart → favorite appears in Favorites tab with correct auto-name
- User adds a favorite → refreshes the page → favorite is still present with correct name and customization
- User drags favorite to grid → placed item has correct customization → generation produces expected images
- User removes favorite via trash icon → placed item still renders correctly, heart shows empty, generation still works
- User renames favorite → new name persists after page reload
- Unauthenticated user → Favorites tab not visible, heart button not visible
