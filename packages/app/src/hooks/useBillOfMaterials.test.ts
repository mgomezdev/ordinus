import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBillOfMaterials } from './useBillOfMaterials';
import type { PlacedItem, LibraryItem, BinCustomization } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION, getBOMKey } from '../types/gridfinity';

const BASE_ITEM: LibraryItem = {
  id: 'lib1:item1',
  libraryId: 'bins_standard',
  name: 'Test Bin',
  widthUnits: 1,
  heightUnits: 1,
  color: '#ff0000',
  categories: ['bin'],
};
const PLACED: PlacedItem = {
  instanceId: 'p1',
  itemId: 'lib1:item1',
  x: 0, y: 0, width: 1, height: 1, rotation: 0,
};

const mockLibraryItems: LibraryItem[] = [
  { id: 'bin-1x1', libraryId: 'bins_standard', name: '1x1 Bin', widthUnits: 1, heightUnits: 1, color: '#646cff', categories: ['bin'] },
  { id: 'bin-1x2', libraryId: 'bins_standard', name: '1x2 Bin', widthUnits: 1, heightUnits: 2, color: '#646cff', categories: ['bin'] },
  { id: 'bin-2x1', libraryId: 'bins_standard', name: '2x1 Bin', widthUnits: 2, heightUnits: 1, color: '#646cff', categories: ['bin'] },
  { id: 'bin-2x2', libraryId: 'bins_standard', name: '2x2 Bin', widthUnits: 2, heightUnits: 2, color: '#646cff', categories: ['bin'] },
  { id: 'divider-1x1', libraryId: 'dividers', name: '1x1 Divider', widthUnits: 1, heightUnits: 1, color: '#22c55e', categories: ['divider'] },
  { id: 'organizer-1x3', libraryId: 'organizers', name: '1x3 Organizer', widthUnits: 1, heightUnits: 3, color: '#f59e0b', categories: ['organizer'] },
];

describe('getBOMKey', () => {
  it('returns itemId:: for undefined customization', () => {
    expect(getBOMKey('bin-1x1', undefined)).toBe('bin-1x1::');
  });

  it('returns itemId:: for default customization', () => {
    expect(getBOMKey('bin-1x1', DEFAULT_BIN_CUSTOMIZATION)).toBe('bin-1x1::');
  });

  it('returns itemId::serialized for non-default customization', () => {
    const custom: BinCustomization = { wallPatternEnabled: true, wallPattern: 'grid', lipStyle: 'normal', fingerSlide: 'none', wallCutout: { front: false, back: false, left: false, right: false }, height: 8 };
    expect(getBOMKey('bin-1x1', custom)).toBe('bin-1x1::grid|normal|none|----|8');
  });
});

describe('useBillOfMaterials', () => {
  it('should return empty array when no items are placed', () => {
    const { result } = renderHook(() => useBillOfMaterials([], mockLibraryItems));
    expect(result.current).toEqual([]);
  });

  it('should count a single placed item', () => {
    const placedItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'bin-1x1',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
    ];

    const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toMatchObject({
      itemId: 'bin-1x1',
      name: '1x1 Bin',
      widthUnits: 1,
      heightUnits: 1,
      quantity: 1,
      categories: ['bin'],
    });
  });

  it('should count multiple instances of the same item', () => {
    const placedItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'bin-2x2',
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
      },
      {
        instanceId: 'instance-2',
        itemId: 'bin-2x2',
        x: 2,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
      },
      {
        instanceId: 'instance-3',
        itemId: 'bin-2x2',
        x: 0,
        y: 2,
        width: 2,
        height: 2,
        rotation: 0,
      },
    ];

    const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].quantity).toBe(3);
    expect(result.current[0].itemId).toBe('bin-2x2');
  });

  it('should not treat rotated items as unique', () => {
    const placedItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'bin-1x2',
        x: 0,
        y: 0,
        width: 1,
        height: 2,
        rotation: 0,
      },
      {
        instanceId: 'instance-2',
        itemId: 'bin-1x2',
        x: 2,
        y: 0,
        width: 2,
        height: 1,
        rotation: 90,
      },
    ];

    const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

    expect(result.current).toHaveLength(1);
    expect(result.current[0].quantity).toBe(2);
    expect(result.current[0].itemId).toBe('bin-1x2');
  });

  it('should handle multiple different item types', () => {
    const placedItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'bin-1x1',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
      {
        instanceId: 'instance-2',
        itemId: 'bin-2x2',
        x: 1,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
      },
      {
        instanceId: 'instance-3',
        itemId: 'divider-1x1',
        x: 3,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
      {
        instanceId: 'instance-4',
        itemId: 'bin-1x1',
        x: 0,
        y: 1,
        width: 1,
        height: 1,
        rotation: 0,
      },
    ];

    const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

    expect(result.current).toHaveLength(3);

    const bin1x1 = result.current.find(item => item.itemId === 'bin-1x1');
    expect(bin1x1?.quantity).toBe(2);

    const bin2x2 = result.current.find(item => item.itemId === 'bin-2x2');
    expect(bin2x2?.quantity).toBe(1);

    const divider1x1 = result.current.find(item => item.itemId === 'divider-1x1');
    expect(divider1x1?.quantity).toBe(1);
  });

  it('should sort items alphabetically by name', () => {
    const placedItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'organizer-1x3',
        x: 0,
        y: 0,
        width: 1,
        height: 3,
        rotation: 0,
      },
      {
        instanceId: 'instance-2',
        itemId: 'divider-1x1',
        x: 1,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
      {
        instanceId: 'instance-3',
        itemId: 'bin-1x1',
        x: 2,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
    ];

    const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

    expect(result.current).toHaveLength(3);
    // Sorted alphabetically: "1x1 Bin", "1x1 Divider", "1x3 Organizer"
    expect(result.current[0].name).toBe('1x1 Bin');
    expect(result.current[1].name).toBe('1x1 Divider');
    expect(result.current[2].name).toBe('1x3 Organizer');
  });

  it('should sort items alphabetically within the same category', () => {
    const placedItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'bin-2x2',
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
      },
      {
        instanceId: 'instance-2',
        itemId: 'bin-1x1',
        x: 2,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
      {
        instanceId: 'instance-3',
        itemId: 'bin-1x2',
        x: 3,
        y: 0,
        width: 1,
        height: 2,
        rotation: 0,
      },
    ];

    const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

    expect(result.current).toHaveLength(3);
    expect(result.current[0].name).toBe('1x1 Bin');
    expect(result.current[1].name).toBe('1x2 Bin');
    expect(result.current[2].name).toBe('2x2 Bin');
  });

  it('should handle items with unknown itemId gracefully', () => {
    const placedItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'bin-1x1',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
      {
        instanceId: 'instance-2',
        itemId: 'unknown-item',
        x: 1,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
    ];

    const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

    // Should only include the valid item
    expect(result.current).toHaveLength(1);
    expect(result.current[0].itemId).toBe('bin-1x1');
  });

  it('should update when placed items change', () => {
    const initialItems: PlacedItem[] = [
      {
        instanceId: 'instance-1',
        itemId: 'bin-1x1',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
    ];

    const { result, rerender } = renderHook(
      ({ items }) => useBillOfMaterials(items, mockLibraryItems),
      { initialProps: { items: initialItems } }
    );

    expect(result.current).toHaveLength(1);
    expect(result.current[0].quantity).toBe(1);

    const updatedItems: PlacedItem[] = [
      ...initialItems,
      {
        instanceId: 'instance-2',
        itemId: 'bin-1x1',
        x: 1,
        y: 0,
        width: 1,
        height: 1,
        rotation: 0,
      },
    ];

    rerender({ items: updatedItems });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].quantity).toBe(2);
  });

  describe('Price propagation', () => {
    it('propagates price from LibraryItem to BOMItem', () => {
      const { result } = renderHook(() =>
        useBillOfMaterials([PLACED], [{ ...BASE_ITEM, price: 12.50 }])
      );
      expect(result.current[0].price).toBe(12.50);
    });

    it('omits price when LibraryItem has no price', () => {
      const { result } = renderHook(() =>
        useBillOfMaterials([PLACED], [BASE_ITEM])
      );
      expect(result.current[0].price).toBeUndefined();
    });
  });

  describe('LibraryId propagation', () => {
    it('includes libraryId from LibraryItem in BOMItem', () => {
      const placed: PlacedItem[] = [
        { instanceId: 'i1', itemId: 'bin-1x1', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
      ];
      const { result } = renderHook(() => useBillOfMaterials(placed, mockLibraryItems));
      expect(result.current).toHaveLength(1);
      expect(result.current[0].libraryId).toBe('bins_standard');
    });
  });

  describe('Customization grouping', () => {
    const gridCustomization: BinCustomization = {
      wallPattern: 'grid',
      lipStyle: 'normal',
      fingerSlide: 'none',
      wallCutout: { front: false, back: false, left: false, right: false },
    };

    const hexCustomization: BinCustomization = {
      wallPattern: 'hexgrid',
      lipStyle: 'reduced',
      fingerSlide: 'rounded',
      wallCutout: { front: true, back: true, left: false, right: false },
    };

    it('should treat items with same itemId but different customizations as separate BOM lines', () => {
      // Arrange: two bin-1x1 items, each with a distinct customization
      const placedItems: PlacedItem[] = [
        {
          instanceId: 'instance-1',
          itemId: 'bin-1x1',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          customization: gridCustomization,
        },
        {
          instanceId: 'instance-2',
          itemId: 'bin-1x1',
          x: 1,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          customization: hexCustomization,
        },
      ];

      const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

      // Each customization variant must produce its own BOM line
      expect(result.current).toHaveLength(2);
      expect(result.current.every(item => item.itemId === 'bin-1x1')).toBe(true);
      expect(result.current.every(item => item.quantity === 1)).toBe(true);
    });

    it('should group items with same itemId and identical customization together', () => {
      // Arrange: two bin-2x2 items sharing the same non-default customization
      const placedItems: PlacedItem[] = [
        {
          instanceId: 'instance-1',
          itemId: 'bin-2x2',
          x: 0,
          y: 0,
          width: 2,
          height: 2,
          rotation: 0,
          customization: gridCustomization,
        },
        {
          instanceId: 'instance-2',
          itemId: 'bin-2x2',
          x: 2,
          y: 0,
          width: 2,
          height: 2,
          rotation: 0,
          customization: gridCustomization,
        },
      ];

      const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

      // Identical customization → single BOM line with count 2
      expect(result.current).toHaveLength(1);
      expect(result.current[0].itemId).toBe('bin-2x2');
      expect(result.current[0].quantity).toBe(2);
    });

    it('should group items with undefined customization and all-default customization together', () => {
      // Arrange: one item with no customization field and one with explicit default values
      const placedItems: PlacedItem[] = [
        {
          instanceId: 'instance-1',
          itemId: 'bin-1x1',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          // customization intentionally omitted
        },
        {
          instanceId: 'instance-2',
          itemId: 'bin-1x1',
          x: 1,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          customization: DEFAULT_BIN_CUSTOMIZATION,
        },
      ];

      const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

      // undefined and all-default values represent the same physical item → one BOM line
      expect(result.current).toHaveLength(1);
      expect(result.current[0].itemId).toBe('bin-1x1');
      expect(result.current[0].quantity).toBe(2);
    });

    it('should include the customization object on the BOMItem when present', () => {
      // Arrange: one item carrying a non-default customization
      const placedItems: PlacedItem[] = [
        {
          instanceId: 'instance-1',
          itemId: 'bin-1x2',
          x: 0,
          y: 0,
          width: 1,
          height: 2,
          rotation: 0,
          customization: hexCustomization,
        },
      ];

      const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].customization).toEqual(hexCustomization);
    });

    it('should sort different customization variants of the same item in alphabetical name order', () => {
      // Arrange: three bin-1x1 items, each with a distinct customization, placed in non-alphabetical order
      const voronoiCustomization: BinCustomization = {
        wallPattern: 'voronoi',
        lipStyle: 'none',
        fingerSlide: 'chamfered',
        wallCutout: { front: true, back: true, left: true, right: true },
      };

      const placedItems: PlacedItem[] = [
        {
          instanceId: 'instance-1',
          itemId: 'bin-1x1',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          customization: voronoiCustomization,
        },
        {
          instanceId: 'instance-2',
          itemId: 'bin-2x1',
          x: 1,
          y: 0,
          width: 2,
          height: 1,
          rotation: 0,
          customization: gridCustomization,
        },
        {
          instanceId: 'instance-3',
          itemId: 'bin-1x1',
          x: 3,
          y: 0,
          width: 1,
          height: 1,
          rotation: 0,
          customization: gridCustomization,
        },
        {
          instanceId: 'instance-4',
          itemId: 'bin-1x1',
          x: 0,
          y: 1,
          width: 1,
          height: 1,
          rotation: 0,
          customization: hexCustomization,
        },
      ];

      const { result } = renderHook(() => useBillOfMaterials(placedItems, mockLibraryItems));

      // Expect four BOM lines (three bin-1x1 variants + one bin-2x1)
      expect(result.current).toHaveLength(4);

      // All four should be sorted alphabetically by name; items with the same base
      // name ("1x1 Bin") come before "2x1 Bin"
      const names = result.current.map(item => item.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);

      // The first three entries are all "1x1 Bin" variants — each has quantity 1
      const bin1x1Lines = result.current.filter(item => item.itemId === 'bin-1x1');
      expect(bin1x1Lines).toHaveLength(3);
      bin1x1Lines.forEach(line => expect(line.quantity).toBe(1));

      // The bin-2x1 entry is also present with quantity 1
      const bin2x1Line = result.current.find(item => item.itemId === 'bin-2x1');
      expect(bin2x1Line).toBeDefined();
      expect(bin2x1Line?.quantity).toBe(1);
    });
  });
});
