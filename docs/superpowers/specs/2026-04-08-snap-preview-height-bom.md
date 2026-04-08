# Design Spec: Snap Preview, Bin Height UI, BOM Descriptions

**Date:** 2026-04-08

---

## Feature 1: Snap Preview Overlay

### Goal
Show a ghost preview of where a dragged bin will land — with cell highlight — before the user releases. Valid targets show in blue, invalid (collision or out-of-bounds) in red.

### Context
Drag-and-drop already snaps to grid cells. This is purely a visual layer on top of existing snap behavior.

### Architecture
A new `SnapPreviewOverlay` component renders inside `GridPreview`, positioned absolutely over the grid, above cell backgrounds but below placed items.

**New prop on `GridPreview`:**
```ts
snapPreview: {
  col: number;
  row: number;
  w: number;      // bin width in grid units
  d: number;      // bin depth in grid units
  valid: boolean;
} | null
```

The overlay is a single `div` sized and positioned to cover the target cell(s), using the same cell-size math as placed bins. `valid` drives a CSS class swap.

**CSS:**
```css
.snap-preview--valid   { background: rgba(59,130,246,0.2); border: 2px dashed #3b82f6; }
.snap-preview--invalid { background: rgba(239,68,68,0.2);  border: 2px dashed #ef4444; }
```

**Data flow:**
- The drag handler already tracks the current drop target cell
- `snapPreview` is computed there: cell position + item footprint + collision check result
- Collision check reuses existing logic already used for placed item validation
- Passed down through to `GridPreview` as a prop

### No changes to
- Drag-and-drop logic
- Collision detection logic
- Snap behavior

---

## Feature 2: Bin Height UI

### Goal
Upgrade the existing height control in `BinCustomizationPanel` from a plain numeric input to a dual-field control showing `[unit]u  [mm]mm`, with smart rounding when mm input doesn't align to a 7mm boundary.

### Context
`BinCustomization.height` already exists as an integer Gridfinity unit count (default: 8). The panel already renders a height input showing `Height (Xmm)`. This is a UI-only change.

### Gridfinity Standard
`1u = 7mm`. Height stored as integer unit count, min 1.

### Behavior
- **Unit field input:** updates mm display immediately (`u × 7`)
- **mm field input:** computes `floor(mm / 7)`, updates unit field; if mm didn't align exactly, shows inline correction message: *"Rounded to Xu (Ymm)"* that auto-dismisses after 2 seconds; mm field snaps to corrected value on blur
- Both fields are numeric inputs, min 1
- Stored value is always the integer unit count

### Display format
```
Height:  [3]u   [21]mm
```

### No changes to
- `BinCustomization` type (height field already exists)
- Storage or serialization
- Default value (8u / 56mm)

---

## Feature 3: BOM Customization Descriptions

### Goal
Show non-default bin customizations as a compact description line below the item name in the Order Summary BOM table.

### Context
`BOMItem.customization` already carries the full `BinCustomization` object. `OrderSummaryPage` currently renders only the item name — customizations are invisible to the user.

### Implementation
A new utility function `formatCustomizationDescription(c: BinCustomization): string`:
- Compares each field against `DEFAULT_BIN_CUSTOMIZATION`
- Skips fields that match the default
- Formats non-default fields with friendly labels (e.g. `wallPattern: 'hexgrid'` → `"Hex Wall"`)
- Height included only when non-default (not 8u), formatted as `"Xu height"`
- Joins with ` · ` separator

**Example output:**
```
Hex Wall · Reduced Lip · 3u height
```

Renders as `<div className="order-bom-description">` below the item name, styled smaller and muted.

### Field label map
| Field | Value | Label |
|---|---|---|
| wallPattern | grid | Grid Wall |
| wallPattern | hexgrid | Hex Wall |
| wallPattern | voronoi | Voronoi Wall |
| wallPattern | voronoigrid | Voronoi Grid Wall |
| wallPattern | voronoihexgrid | Voronoi Hex Wall |
| lipStyle | reduced | Reduced Lip |
| lipStyle | minimum | Minimum Lip |
| lipStyle | none | No Lip |
| fingerSlide | rounded | Rounded Finger Slide |
| fingerSlide | chamfered | Chamfered Finger Slide |
| wallCutout | vertical | Vertical Cutout |
| wallCutout | horizontal | Horizontal Cutout |
| wallCutout | both | Full Cutout |
| height | (non-default) | Xu height |

### No changes to
- `BOMItem` type
- `useBillOfMaterials` hook
- Grouping or sorting logic
