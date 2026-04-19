import { useState, useCallback, useMemo, useRef } from 'react';
import type { PlacedItem, PlacedItemWithValidity, DragData, LibraryItem, Rotation, BinCustomization } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';
import { ROTATION_CW, ROTATION_CCW } from '../utils/constants';
import { mergeGeneratorParams, generatorParamsToBinCustomization } from '../utils/generatorParams';

/**
 * Grid-based occupancy count for O(n) collision detection.
 * Each cell stores the number of items occupying it.
 */
function buildOccupancyCount(
  items: PlacedItem[],
  gridX: number,
  gridY: number
): number[][] {
  const grid: number[][] = Array.from({ length: gridY }, () =>
    new Array<number>(gridX).fill(0)
  );
  for (const item of items) {
    for (let dy = 0; dy < item.height; dy++) {
      for (let dx = 0; dx < item.width; dx++) {
        const cx = item.x + dx;
        const cy = item.y + dy;
        if (cx >= 0 && cx < gridX && cy >= 0 && cy < gridY) {
          grid[cy][cx]++;
        }
      }
    }
  }
  return grid;
}

export function hasCollision(
  items: PlacedItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  excludeId?: string
): boolean {
  for (const item of items) {
    if (excludeId && item.instanceId === excludeId) continue;

    // AABB overlap check
    const overlapX = x < item.x + item.width && x + width > item.x;
    const overlapY = y < item.y + item.height && y + height > item.y;

    if (overlapX && overlapY) {
      return true;
    }
  }
  return false;
}

function hasCollisionExcludeSet(
  items: PlacedItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  excludeIds: Set<string>
): boolean {
  for (const item of items) {
    if (excludeIds.has(item.instanceId)) continue;
    const overlapX = x < item.x + item.width && x + width > item.x;
    const overlapY = y < item.y + item.height && y + height > item.y;
    if (overlapX && overlapY) return true;
  }
  return false;
}

export function isOutOfBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  gridX: number,
  gridY: number
): boolean {
  return x < 0 || y < 0 || x + width > gridX || y + height > gridY;
}


function isSideways(rotation: Rotation): boolean {
  return rotation === 90 || rotation === 270;
}

let instanceCounter = 0;

function generateInstanceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `item-${crypto.randomUUID()}`;
  }
  return `item-${++instanceCounter}-${Date.now()}`;
}

function findValidPosition(
  items: PlacedItem[],
  width: number,
  height: number,
  startX: number,
  startY: number,
  gridX: number,
  gridY: number,
  excludeId?: string
): { x: number; y: number } | null {
  if (
    !isOutOfBounds(startX, startY, width, height, gridX, gridY) &&
    !hasCollision(items, startX, startY, width, height, excludeId)
  ) {
    return { x: startX, y: startY };
  }

  for (let radius = 1; radius <= Math.max(gridX, gridY); radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const x = startX + dx;
        const y = startY + dy;
        if (
          !isOutOfBounds(x, y, width, height, gridX, gridY) &&
          !hasCollision(items, x, y, width, height, excludeId)
        ) {
          return { x, y };
        }
      }
    }
  }

  return null;
}

const EMPTY_SET: Set<string> = new Set();

export interface SelectModifiers {
  shift?: boolean;
  ctrl?: boolean;
}

export function useGridItems(
  gridX: number,
  gridY: number,
  getItemById: (id: string) => LibraryItem | undefined
) {
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(EMPTY_SET);
  const [clipboard, setClipboard] = useState<PlacedItem[]>([]);

  // Refs for synchronous cross-state reads within the same React batch.
  const itemsRef = useRef<PlacedItem[]>(placedItems);
  const selectedRef = useRef<Set<string>>(selectedItemIds);
  const clipboardRef = useRef<PlacedItem[]>(clipboard);

  const updateItems = useCallback((items: PlacedItem[]) => {
    itemsRef.current = items;
    setPlacedItems(items);
  }, []);

  const updateSelected = useCallback((ids: Set<string>) => {
    selectedRef.current = ids;
    setSelectedItemIds(ids);
  }, []);

  const updateClipboard = useCallback((items: PlacedItem[]) => {
    clipboardRef.current = items;
    setClipboard(items);
  }, []);

  // Backward compat: first selected item or null
  const selectedItemId = useMemo(() => {
    if (selectedItemIds.size === 0) return null;
    // Return first item that exists in placed items (maintains stable ordering)
    for (const item of placedItems) {
      if (selectedItemIds.has(item.instanceId)) return item.instanceId;
    }
    return null;
  }, [selectedItemIds, placedItems]);

  const placedItemsWithValidity: PlacedItemWithValidity[] = useMemo(() => {
    // Build occupancy count grid once (O(total_cells)), then check each item (O(item_cells))
    const occupancy = buildOccupancyCount(placedItems, gridX, gridY);
    return placedItems.map(item => {
      const oob = isOutOfBounds(item.x, item.y, item.width, item.height, gridX, gridY);
      if (oob) return { ...item, isValid: false };
      // A cell with count > 1 means multiple items overlap there
      let collides = false;
      for (let dy = 0; dy < item.height && !collides; dy++) {
        for (let dx = 0; dx < item.width && !collides; dx++) {
          const cx = item.x + dx;
          const cy = item.y + dy;
          if (cx >= 0 && cx < gridX && cy >= 0 && cy < gridY && occupancy[cy][cx] > 1) {
            collides = true;
          }
        }
      }
      return { ...item, isValid: !collides };
    });
  }, [placedItems, gridX, gridY]);

  const addItem = useCallback((itemId: string, x: number, y: number) => {
    const libraryItem = getItemById(itemId);
    if (!libraryItem) return;

    const allFields = ['wallPattern', 'lipStyle', 'fingerSlide', 'wallCutout', 'height'] as const;
    const prefilledDefaults = libraryItem.defaultParameters
      ? generatorParamsToBinCustomization(libraryItem.defaultParameters, [...allFields])
      : {};
    const hasCustomDefaults = Object.keys(prefilledDefaults).length > 0;

    const newItem: PlacedItem = {
      instanceId: generateInstanceId(),
      itemId,
      x,
      y,
      width: libraryItem.widthUnits,
      height: libraryItem.heightUnits,
      rotation: 0,
      customization: hasCustomDefaults
        ? { ...DEFAULT_BIN_CUSTOMIZATION, ...prefilledDefaults }
        : undefined,
      defaultParameters: libraryItem.defaultParameters
        ? mergeGeneratorParams(libraryItem.defaultParameters)
        : undefined,
    };

    updateItems([...itemsRef.current, newItem]);
    updateSelected(new Set([newItem.instanceId]));
  }, [getItemById, updateItems, updateSelected]);

  const moveItem = useCallback((instanceId: string, newX: number, newY: number) => {
    const updated = itemsRef.current.map(item =>
      item.instanceId === instanceId ? { ...item, x: newX, y: newY } : item
    );
    updateItems(updated);
  }, [updateItems]);

  const updateItemCustomization = useCallback((instanceId: string, customization: BinCustomization | undefined) => {
    const updated = itemsRef.current.map(item =>
      item.instanceId === instanceId ? { ...item, customization } : item
    );
    updateItems(updated);
  }, [updateItems]);

  const rotateItem = useCallback((instanceId: string, direction: 'cw' | 'ccw' = 'cw') => {
    const updated = itemsRef.current.map(item => {
      if (item.instanceId !== instanceId) return item;

      const newRotation = direction === 'cw'
        ? ROTATION_CW[item.rotation]
        : ROTATION_CCW[item.rotation];

      const shouldSwap = isSideways(item.rotation) !== isSideways(newRotation);

      return {
        ...item,
        width: shouldSwap ? item.height : item.width,
        height: shouldSwap ? item.width : item.height,
        rotation: newRotation,
      };
    });
    updateItems(updated);
  }, [updateItems]);

  const deleteItem = useCallback((instanceId: string) => {
    updateItems(itemsRef.current.filter(item => item.instanceId !== instanceId));
    const current = selectedRef.current;
    if (current.has(instanceId)) {
      const next = new Set(current);
      next.delete(instanceId);
      updateSelected(next.size === 0 ? EMPTY_SET : next);
    }
  }, [updateItems, updateSelected]);

  const clearAll = useCallback(() => {
    updateItems([]);
    updateSelected(EMPTY_SET);
  }, [updateItems, updateSelected]);

  const selectItem = useCallback((instanceId: string | null, modifiers?: SelectModifiers) => {
    if (instanceId === null) {
      updateSelected(EMPTY_SET);
      return;
    }

    const current = selectedRef.current;

    if (modifiers?.ctrl) {
      const next = new Set(current);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      updateSelected(next.size === 0 ? EMPTY_SET : next);
    } else if (modifiers?.shift) {
      const next = new Set(current);
      next.add(instanceId);
      updateSelected(next);
    } else {
      updateSelected(new Set([instanceId]));
    }
  }, [updateSelected]);

  const selectAll = useCallback(() => {
    const items = itemsRef.current;
    if (items.length === 0) return;
    updateSelected(new Set(items.map(item => item.instanceId)));
  }, [updateSelected]);

  const deselectAll = useCallback(() => {
    updateSelected(EMPTY_SET);
  }, [updateSelected]);

  const handleDrop = useCallback((dragData: DragData, dropX: number, dropY: number) => {
    if (dragData.type === 'library') {
      addItem(dragData.itemId, dropX, dropY);
    } else if (dragData.type === 'placed' && dragData.instanceId) {
      const currentSelected = selectedRef.current;
      // Group move: if dragged item is part of a multi-selection, move the whole group
      if (currentSelected.size > 1 && currentSelected.has(dragData.instanceId)) {
        const items = itemsRef.current;
        const draggedItem = items.find(i => i.instanceId === dragData.instanceId);
        if (!draggedItem) return;
        const dx = dropX - draggedItem.x;
        const dy = dropY - draggedItem.y;

        // Validate all moves (exclude selected items from collision checks)
        const allValid = items
          .filter(i => currentSelected.has(i.instanceId))
          .every(i => !isOutOfBounds(i.x + dx, i.y + dy, i.width, i.height, gridX, gridY) &&
            !hasCollisionExcludeSet(items, i.x + dx, i.y + dy, i.width, i.height, currentSelected));

        if (!allValid) return;

        const updated = items.map(item =>
          currentSelected.has(item.instanceId)
            ? { ...item, x: item.x + dx, y: item.y + dy }
            : item
        );
        updateItems(updated);
      } else {
        moveItem(dragData.instanceId, dropX, dropY);
      }
    }
  }, [addItem, moveItem, gridX, gridY, updateItems]);

  const deleteSelected = useCallback(() => {
    const ids = selectedRef.current;
    if (ids.size === 0) return;
    updateItems(itemsRef.current.filter(item => !ids.has(item.instanceId)));
    updateSelected(EMPTY_SET);
  }, [updateItems, updateSelected]);

  const rotateSelected = useCallback((direction: 'cw' | 'ccw' = 'cw') => {
    const ids = selectedRef.current;
    if (ids.size === 0) return;

    const updated = itemsRef.current.map(item => {
      if (!ids.has(item.instanceId)) return item;

      const newRotation = direction === 'cw'
        ? ROTATION_CW[item.rotation]
        : ROTATION_CCW[item.rotation];

      const shouldSwap = isSideways(item.rotation) !== isSideways(newRotation);

      return {
        ...item,
        width: shouldSwap ? item.height : item.width,
        height: shouldSwap ? item.width : item.height,
        rotation: newRotation,
      };
    });
    updateItems(updated);
  }, [updateItems]);

  const moveSelected = useCallback((dx: number, dy: number) => {
    const ids = selectedRef.current;
    if (ids.size === 0) return;

    const updated = itemsRef.current.map(item =>
      ids.has(item.instanceId) ? { ...item, x: item.x + dx, y: item.y + dy } : item
    );
    updateItems(updated);
  }, [updateItems]);

  const duplicateItem = useCallback(() => {
    const ids = selectedRef.current;
    if (ids.size === 0) return;

    const items = itemsRef.current;
    const sources = items.filter(item => ids.has(item.instanceId));
    if (sources.length === 0) return;

    const allItems = [...items];
    const newIds: string[] = [];

    for (const source of sources) {
      const pos = findValidPosition(
        allItems, source.width, source.height,
        source.x + 1, source.y + 1,
        gridX, gridY
      );
      if (!pos) continue;

      const newItem: PlacedItem = {
        ...source,
        instanceId: generateInstanceId(),
        x: pos.x,
        y: pos.y,
      };

      allItems.push(newItem);
      newIds.push(newItem.instanceId);
    }

    if (newIds.length === 0) return;

    updateItems(allItems);
    updateSelected(new Set(newIds));
  }, [gridX, gridY, updateItems, updateSelected]);

  const copyItems = useCallback(() => {
    const ids = selectedRef.current;
    if (ids.size === 0) {
      updateClipboard([]);
      return;
    }
    const selected = itemsRef.current.filter(item => ids.has(item.instanceId));
    updateClipboard(selected);
  }, [updateClipboard]);

  const loadItems = useCallback((items: PlacedItem[]) => {
    // Replace all current items with the given items, assigning new instance IDs
    const newItems = items.map(item => ({
      ...item,
      instanceId: generateInstanceId(),
    }));
    updateItems(newItems);
    updateSelected(EMPTY_SET);
  }, [updateItems, updateSelected]);

  const pasteItems = useCallback(() => {
    const clipboardItems = clipboardRef.current;
    if (clipboardItems.length === 0) return;

    const currentItems = itemsRef.current;
    const newItems: PlacedItem[] = [];

    for (const item of clipboardItems) {
      const centerX = Math.floor(gridX / 2);
      const centerY = Math.floor(gridY / 2);

      const pos = findValidPosition(
        [...currentItems, ...newItems], item.width, item.height,
        centerX, centerY,
        gridX, gridY
      );
      if (!pos) continue;

      newItems.push({
        ...item,
        instanceId: generateInstanceId(),
        x: pos.x,
        y: pos.y,
      });
    }

    if (newItems.length === 0) return;

    updateItems([...currentItems, ...newItems]);
    updateSelected(new Set(newItems.map(i => i.instanceId)));
  }, [gridX, gridY, updateItems, updateSelected]);

  return {
    placedItems: placedItemsWithValidity,
    selectedItemId,
    selectedItemIds,
    clipboard,
    addItem,
    moveItem,
    rotateItem,
    updateItemCustomization,
    deleteItem,
    clearAll,
    loadItems,
    selectItem,
    selectAll,
    deselectAll,
    handleDrop,
    duplicateItem,
    copyItems,
    pasteItems,
    deleteSelected,
    rotateSelected,
    moveSelected,
  };
}
