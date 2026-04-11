# Snap Preview, Bin Height UI, and BOM Descriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a snap preview ghost overlay while dragging bins, upgrade the bin height control to dual unit/mm inputs, and show non-default customizations in the BOM.

**Architecture:** Three independent features. Height UI is a local-state upgrade to `BinCustomizationPanel`. BOM descriptions add a pure utility function consumed by `OrderSummaryPage`. Snap preview threads a new `onSnapChange` callback from `usePointerDrag` → `GridPreview` → `WorkspacePage`, where validity is computed using exported helpers from `useGridItems` and rendered by a new `SnapPreviewOverlay` component.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library (unit), Playwright (E2E)

---

## File Map

| File | Change |
|---|---|
| `packages/app/src/components/BinCustomizationPanel.tsx` | Replace height field with dual unit/mm inputs + correction message |
| `packages/app/src/components/BinCustomizationPanel.test.tsx` | Update/add height field tests |
| `packages/app/src/utils/customizationDescription.ts` | New — `formatCustomizationDescription` utility |
| `packages/app/src/utils/customizationDescription.test.ts` | New — unit tests for above |
| `packages/app/src/pages/OrderSummaryPage.tsx` | Render customization description below item name |
| `packages/app/src/hooks/useGridItems.ts` | Export `hasCollision` and `isOutOfBounds` |
| `packages/app/src/hooks/usePointerDrag.ts` | Add `onSnapChange` to `DropTargetConfig` + `PointerDropTargetOptions`; call during drag |
| `packages/app/src/components/SnapPreviewOverlay.tsx` | New — renders ghost preview div |
| `packages/app/src/components/GridPreview.tsx` | Add `snapPreview` + `onSnapChange` props; render `SnapPreviewOverlay` |
| `packages/app/src/components/GridPreview.test.tsx` | Add snap preview rendering tests |
| `packages/app/src/pages/WorkspacePage.tsx` | Add `rawSnapPreview` state, compute `snapPreview`, pass to `GridPreview` |
| `packages/app/src/index.css` | Add `.snap-preview--valid` and `.snap-preview--invalid` styles |

---

## Task 1: Bin Height UI — update tests

**Files:**
- Modify: `packages/app/src/components/BinCustomizationPanel.test.tsx`

- [ ] **Step 1: Update the existing height field tests to match the new UI**

Replace the existing `describe('height field', ...)` block (around line 664) with:

```ts
describe('height field', () => {
  it('renders unit and mm inputs', () => {
    render(
      <BinCustomizationPanel
        customization={DEFAULT_BIN_CUSTOMIZATION}
        onChange={mockOnChange}
        onReset={mockOnReset}
        customizableFields={['height']}
      />
    );
    expect(screen.getByLabelText('Height in units')).toBeInTheDocument();
    expect(screen.getByLabelText('Height in millimeters')).toBeInTheDocument();
  });

  it('unit input shows current height, mm input shows height * 7', () => {
    render(
      <BinCustomizationPanel
        customization={{ ...DEFAULT_BIN_CUSTOMIZATION, height: 3 }}
        onChange={mockOnChange}
        onReset={mockOnReset}
        customizableFields={['height']}
      />
    );
    expect(screen.getByLabelText('Height in units')).toHaveValue(3);
    expect(screen.getByLabelText('Height in millimeters')).toHaveValue(21);
  });

  it('changing unit input calls onChange with new height', () => {
    render(
      <BinCustomizationPanel
        customization={DEFAULT_BIN_CUSTOMIZATION}
        onChange={mockOnChange}
        onReset={mockOnReset}
        customizableFields={['height']}
      />
    );
    fireEvent.change(screen.getByLabelText('Height in units'), { target: { value: '5' } });
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 5 }));
  });

  it('blurring mm input with aligned value calls onChange with correct units', () => {
    render(
      <BinCustomizationPanel
        customization={DEFAULT_BIN_CUSTOMIZATION}
        onChange={mockOnChange}
        onReset={mockOnReset}
        customizableFields={['height']}
      />
    );
    fireEvent.change(screen.getByLabelText('Height in millimeters'), { target: { value: '28' } });
    fireEvent.blur(screen.getByLabelText('Height in millimeters'));
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 4 }));
  });

  it('blurring mm input with unaligned value rounds down and shows correction message', async () => {
    render(
      <BinCustomizationPanel
        customization={DEFAULT_BIN_CUSTOMIZATION}
        onChange={mockOnChange}
        onReset={mockOnReset}
        customizableFields={['height']}
      />
    );
    fireEvent.change(screen.getByLabelText('Height in millimeters'), { target: { value: '23' } });
    fireEvent.blur(screen.getByLabelText('Height in millimeters'));
    expect(mockOnChange).toHaveBeenCalledWith(expect.objectContaining({ height: 3 }));
    expect(await screen.findByText(/rounded to 3u \(21mm\)/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run height tests — confirm they FAIL**

```bash
cd .worktrees/feat/snap-preview-height-bom
npx vitest run packages/app/src/components/BinCustomizationPanel.test.tsx 2>&1 | tail -20
```

Expected: failures on height field tests (old UI doesn't have the new aria-labels).

---

## Task 2: Bin Height UI — implement dual inputs

**Files:**
- Modify: `packages/app/src/components/BinCustomizationPanel.tsx`

- [ ] **Step 1: Replace the height field block with dual inputs**

Add `useState` and `useRef` imports at the top:
```ts
import { useState, useRef } from 'react';
```

Replace the `{has('height') && (...)}` block (currently around line 103) with:

```tsx
{has('height') && (
  <HeightField
    height={current.height}
    idPrefix={idPrefix}
    onChange={(h) => onChange({ ...current, height: h })}
  />
)}
```

Add the `HeightField` component above `BinCustomizationPanel` in the same file:

```tsx
interface HeightFieldProps {
  height: number;
  idPrefix: string;
  onChange: (height: number) => void;
}

function HeightField({ height, idPrefix, onChange }: HeightFieldProps) {
  const [mmEditValue, setMmEditValue] = useState<string | null>(null);
  const [correctionMsg, setCorrectionMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayedMm = mmEditValue ?? String(height * 7);

  const handleUnitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1 && v <= 20) {
      onChange(v);
    }
  };

  const handleMmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMmEditValue(e.target.value);
  };

  const handleMmBlur = () => {
    const raw = parseInt(mmEditValue ?? '', 10);
    setMmEditValue(null);
    if (isNaN(raw) || raw < 7) return;
    const units = Math.floor(raw / 7);
    const snapped = units * 7;
    if (snapped !== raw) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCorrectionMsg(`Rounded to ${units}u (${snapped}mm)`);
      timerRef.current = setTimeout(() => setCorrectionMsg(null), 2000);
    }
    if (units >= 1 && units <= 20) {
      onChange(units);
    }
  };

  return (
    <div className="bin-customization-field">
      <label>Height</label>
      <div className="height-inputs">
        <input
          id={`${idPrefix}height-units-input`}
          aria-label="Height in units"
          type="number"
          min={1}
          max={20}
          value={height}
          onChange={handleUnitChange}
        />
        <span>u</span>
        <input
          id={`${idPrefix}height-mm-input`}
          aria-label="Height in millimeters"
          type="number"
          min={7}
          value={displayedMm}
          onChange={handleMmChange}
          onBlur={handleMmBlur}
        />
        <span>mm</span>
      </div>
      {correctionMsg && (
        <div className="height-correction" role="status">{correctionMsg}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run height tests — all must pass**

```bash
npx vitest run packages/app/src/components/BinCustomizationPanel.test.tsx 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Run full unit suite to check for regressions**

```bash
npm run test:run 2>&1 | tail -10
```

Expected: all 1150 app + 220 server tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/app/src/components/BinCustomizationPanel.tsx \
        packages/app/src/components/BinCustomizationPanel.test.tsx
git commit -m "feat(customization): dual unit/mm height inputs with rounding correction"
```

---

## Task 3: BOM Descriptions — utility and tests

**Files:**
- Create: `packages/app/src/utils/customizationDescription.ts`
- Create: `packages/app/src/utils/customizationDescription.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/app/src/utils/customizationDescription.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatCustomizationDescription } from './customizationDescription';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';

describe('formatCustomizationDescription', () => {
  it('returns empty string for default customization', () => {
    expect(formatCustomizationDescription(DEFAULT_BIN_CUSTOMIZATION)).toBe('');
  });

  it('returns empty string when all fields are default', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION })).toBe('');
  });

  it('formats non-default wall pattern', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPattern: 'hexgrid' }))
      .toBe('Hex Wall');
  });

  it('formats non-default lip style', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, lipStyle: 'reduced' }))
      .toBe('Reduced Lip');
  });

  it('formats non-default finger slide', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, fingerSlide: 'chamfered' }))
      .toBe('Chamfered Finger Slide');
  });

  it('formats non-default wall cutout', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: 'both' }))
      .toBe('Full Cutout');
  });

  it('formats non-default height', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, height: 3 }))
      .toBe('3u height');
  });

  it('joins multiple non-default fields with ·', () => {
    expect(formatCustomizationDescription({
      wallPattern: 'hexgrid',
      lipStyle: 'reduced',
      fingerSlide: 'none',
      wallCutout: 'none',
      height: 3,
    })).toBe('Hex Wall · Reduced Lip · 3u height');
  });

  it('handles all wall pattern values', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPattern: 'grid' })).toBe('Grid Wall');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPattern: 'voronoi' })).toBe('Voronoi Wall');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPattern: 'voronoigrid' })).toBe('Voronoi Grid Wall');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallPattern: 'voronoihexgrid' })).toBe('Voronoi Hex Wall');
  });

  it('handles all lip style values', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, lipStyle: 'minimum' })).toBe('Minimum Lip');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, lipStyle: 'none' })).toBe('No Lip');
  });

  it('handles all wall cutout values', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: 'vertical' })).toBe('Vertical Cutout');
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, wallCutout: 'horizontal' })).toBe('Horizontal Cutout');
  });

  it('handles rounded finger slide', () => {
    expect(formatCustomizationDescription({ ...DEFAULT_BIN_CUSTOMIZATION, fingerSlide: 'rounded' })).toBe('Rounded Finger Slide');
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
npx vitest run packages/app/src/utils/customizationDescription.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the utility**

Create `packages/app/src/utils/customizationDescription.ts`:

```ts
import type { BinCustomization } from '../types/gridfinity';
import { DEFAULT_BIN_CUSTOMIZATION } from '../types/gridfinity';

const WALL_PATTERN_LABELS: Record<string, string> = {
  grid: 'Grid Wall',
  hexgrid: 'Hex Wall',
  voronoi: 'Voronoi Wall',
  voronoigrid: 'Voronoi Grid Wall',
  voronoihexgrid: 'Voronoi Hex Wall',
};

const LIP_STYLE_LABELS: Record<string, string> = {
  reduced: 'Reduced Lip',
  minimum: 'Minimum Lip',
  none: 'No Lip',
};

const FINGER_SLIDE_LABELS: Record<string, string> = {
  rounded: 'Rounded Finger Slide',
  chamfered: 'Chamfered Finger Slide',
};

const WALL_CUTOUT_LABELS: Record<string, string> = {
  vertical: 'Vertical Cutout',
  horizontal: 'Horizontal Cutout',
  both: 'Full Cutout',
};

export function formatCustomizationDescription(c: BinCustomization): string {
  const parts: string[] = [];
  if (c.wallPattern !== DEFAULT_BIN_CUSTOMIZATION.wallPattern) {
    parts.push(WALL_PATTERN_LABELS[c.wallPattern] ?? c.wallPattern);
  }
  if (c.lipStyle !== DEFAULT_BIN_CUSTOMIZATION.lipStyle) {
    parts.push(LIP_STYLE_LABELS[c.lipStyle] ?? c.lipStyle);
  }
  if (c.fingerSlide !== DEFAULT_BIN_CUSTOMIZATION.fingerSlide) {
    parts.push(FINGER_SLIDE_LABELS[c.fingerSlide] ?? c.fingerSlide);
  }
  if (c.wallCutout !== DEFAULT_BIN_CUSTOMIZATION.wallCutout) {
    parts.push(WALL_CUTOUT_LABELS[c.wallCutout] ?? c.wallCutout);
  }
  if (c.height !== DEFAULT_BIN_CUSTOMIZATION.height) {
    parts.push(`${c.height}u height`);
  }
  return parts.join(' · ');
}
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npx vitest run packages/app/src/utils/customizationDescription.test.ts 2>&1 | tail -10
```

Expected: all 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/utils/customizationDescription.ts \
        packages/app/src/utils/customizationDescription.test.ts
git commit -m "feat(bom): add formatCustomizationDescription utility"
```

---

## Task 4: BOM Descriptions — render in OrderSummaryPage

**Files:**
- Modify: `packages/app/src/pages/OrderSummaryPage.tsx`

- [ ] **Step 1: Add the import and render the description**

Add import at the top of `OrderSummaryPage.tsx`:
```ts
import { formatCustomizationDescription } from '../utils/customizationDescription';
```

Inside the BOM table row, replace the name cell:
```tsx
// BEFORE:
<div>
  <div className="order-bom-name">{item.name}</div>
</div>

// AFTER:
<div>
  <div className="order-bom-name">{item.name}</div>
  {item.customization && (() => {
    const desc = formatCustomizationDescription(item.customization);
    return desc ? <div className="order-bom-description">{desc}</div> : null;
  })()}
</div>
```

Add to `packages/app/src/pages/OrderSummaryPage.css` (or wherever the page styles live — check the import at the top of the file):
```css
.order-bom-description {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 2px;
}
```

- [ ] **Step 2: Run full unit suite**

```bash
npm run test:run 2>&1 | tail -10
```

Expected: all tests pass (no snapshot or rendering tests reference this cell).

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/pages/OrderSummaryPage.tsx \
        packages/app/src/pages/OrderSummaryPage.css
git commit -m "feat(bom): show non-default customizations as description in order summary"
```

---

## Task 5: Snap Preview — export collision helpers

**Files:**
- Modify: `packages/app/src/hooks/useGridItems.ts`

- [ ] **Step 1: Export `hasCollision` and `isOutOfBounds`**

In `useGridItems.ts`, change the function declarations from `function hasCollision(` and `function isOutOfBounds(` to `export function hasCollision(` and `export function isOutOfBounds(`. These are pure utility functions with no React dependencies.

```ts
// line ~32 — change to:
export function hasCollision(
  items: PlacedItem[],
  x: number,
  y: number,
  width: number,
  height: number,
  excludeId?: string
): boolean {

// line ~72 — change to:
export function isOutOfBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  gridX: number,
  gridY: number
): boolean {
```

- [ ] **Step 2: Run full unit suite — no regressions**

```bash
npm run test:run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/app/src/hooks/useGridItems.ts
git commit -m "refactor(grid): export hasCollision and isOutOfBounds for reuse"
```

---

## Task 6: Snap Preview — add onSnapChange to drag system

**Files:**
- Modify: `packages/app/src/hooks/usePointerDrag.ts`

- [ ] **Step 1: Define the SnapPreview type and add onSnapChange to DropTargetConfig**

At the top of `usePointerDrag.ts`, after the imports, add:

```ts
export interface SnapPreviewData {
  dragData: DragData;
  col: number;
  row: number;
}
```

In the `DropTargetConfig` interface, add:
```ts
interface DropTargetConfig {
  element: HTMLElement;
  gridX: number;
  gridY: number;
  onDrop: (dragData: DragData, x: number, y: number) => void;
  onSnapChange?: (preview: SnapPreviewData | null) => void;
}
```

In the `PointerDropTargetOptions` interface, add:
```ts
interface PointerDropTargetOptions {
  gridRef: React.RefObject<HTMLDivElement | null>;
  gridX: number;
  gridY: number;
  onDrop: (dragData: DragData, x: number, y: number) => void;
  onSnapChange?: (preview: SnapPreviewData | null) => void;
}
```

In `registerDropTarget` and `usePointerDropTarget`, pass `onSnapChange` through:
```ts
// in usePointerDropTarget:
export function usePointerDropTarget(options: PointerDropTargetOptions): void {
  const { gridRef, gridX, gridY, onDrop, onSnapChange } = options;

  useEffect(() => {
    const el = gridRef.current;
    if (!el || gridX <= 0 || gridY <= 0) return;
    registerDropTarget({ element: el, gridX, gridY, onDrop, onSnapChange });
    return () => unregisterDropTarget();
  }, [gridRef, gridX, gridY, onDrop, onSnapChange]);
}
```

- [ ] **Step 2: Call onSnapChange during pointermove**

Inside the `handlePointerMove` function in `usePointerDragSource`, after the ghost element is moved, add:

```ts
// After the ghost move block:
if (isDragging && dragStore.dropTarget) {
  const { element, gridX: tgX, gridY: tgY, onSnapChange } = dragStore.dropTarget;
  const rect = element.getBoundingClientRect();
  if (
    moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right &&
    moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom
  ) {
    const cellWidth = rect.width / tgX;
    const cellHeight = rect.height / tgY;
    const col = Math.max(0, Math.min(Math.floor((moveEvent.clientX - rect.left) / cellWidth), tgX - 1));
    const row = Math.max(0, Math.min(Math.floor((moveEvent.clientY - rect.top) / cellHeight), tgY - 1));
    onSnapChange?.({ dragData: dragStore.activeDrag!.data, col, row });
  } else {
    onSnapChange?.(null);
  }
}
```

- [ ] **Step 3: Clear snap preview on drag end and cancel**

In `handlePointerUp` (inside the `isDragging` branch), before `attemptDrop`:
```ts
dragStore.dropTarget?.onSnapChange?.(null);
```

In `handlePointerCancel`, before `clearActiveDrag()`:
```ts
dragStore.dropTarget?.onSnapChange?.(null);
```

- [ ] **Step 4: Run full unit suite — no regressions**

```bash
npm run test:run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/hooks/usePointerDrag.ts
git commit -m "feat(drag): emit onSnapChange with current snap cell during drag"
```

---

## Task 7: Snap Preview — SnapPreviewOverlay component

**Files:**
- Create: `packages/app/src/components/SnapPreviewOverlay.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/app/src/components/SnapPreviewOverlay.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SnapPreviewOverlay } from './SnapPreviewOverlay';

describe('SnapPreviewOverlay', () => {
  it('renders with valid class when valid', () => {
    const { container } = render(
      <SnapPreviewOverlay col={1} row={0} w={2} d={1} valid={true} gridX={4} gridY={4} />
    );
    expect(container.firstChild).toHaveClass('snap-preview--valid');
  });

  it('renders with invalid class when not valid', () => {
    const { container } = render(
      <SnapPreviewOverlay col={0} row={0} w={2} d={1} valid={false} gridX={4} gridY={4} />
    );
    expect(container.firstChild).toHaveClass('snap-preview--invalid');
  });

  it('positions correctly using percentage-based styles', () => {
    const { container } = render(
      <SnapPreviewOverlay col={1} row={2} w={2} d={1} valid={true} gridX={4} gridY={4} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.left).toBe('25%');
    expect(el.style.top).toBe('50%');
    expect(el.style.width).toBe('50%');
    expect(el.style.height).toBe('25%');
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(
      <SnapPreviewOverlay col={0} row={0} w={1} d={1} valid={true} gridX={4} gridY={4} />
    );
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
```

- [ ] **Step 2: Run tests — confirm they FAIL**

```bash
npx vitest run packages/app/src/components/SnapPreviewOverlay.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `packages/app/src/components/SnapPreviewOverlay.tsx`:

```tsx
interface SnapPreviewOverlayProps {
  col: number;
  row: number;
  w: number;
  d: number;
  valid: boolean;
  gridX: number;
  gridY: number;
}

export function SnapPreviewOverlay({ col, row, w, d, valid, gridX, gridY }: SnapPreviewOverlayProps) {
  return (
    <div
      className={`snap-preview ${valid ? 'snap-preview--valid' : 'snap-preview--invalid'}`}
      style={{
        position: 'absolute',
        left: `${(col / gridX) * 100}%`,
        top: `${(row / gridY) * 100}%`,
        width: `${(w / gridX) * 100}%`,
        height: `${(d / gridY) * 100}%`,
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden="true"
    />
  );
}
```

- [ ] **Step 4: Run SnapPreviewOverlay tests — all pass**

```bash
npx vitest run packages/app/src/components/SnapPreviewOverlay.test.tsx 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/SnapPreviewOverlay.tsx \
        packages/app/src/components/SnapPreviewOverlay.test.tsx
git commit -m "feat(grid): add SnapPreviewOverlay component"
```

---

## Task 8: Snap Preview — wire into GridPreview

**Files:**
- Modify: `packages/app/src/components/GridPreview.tsx`
- Modify: `packages/app/src/components/GridPreview.test.tsx`

- [ ] **Step 1: Add failing tests to GridPreview.test.tsx**

Add a new `describe('Snap Preview', ...)` block near the end of the existing GridPreview test file:

```tsx
describe('Snap Preview', () => {
  const baseProps = {
    gridX: 4,
    gridY: 4,
    placedItems: [],
    selectedItemIds: new Set<string>(),
    onDrop: vi.fn(),
    onSelectItem: vi.fn(),
    getItemById: vi.fn(),
  };

  it('renders no snap preview when snapPreview is null', () => {
    const { container } = render(<GridPreview {...baseProps} snapPreview={null} />);
    expect(container.querySelector('.snap-preview')).toBeNull();
  });

  it('renders valid snap preview overlay', () => {
    const { container } = render(
      <GridPreview
        {...baseProps}
        snapPreview={{ col: 1, row: 0, w: 2, d: 1, valid: true }}
      />
    );
    expect(container.querySelector('.snap-preview--valid')).toBeInTheDocument();
  });

  it('renders invalid snap preview overlay', () => {
    const { container } = render(
      <GridPreview
        {...baseProps}
        snapPreview={{ col: 0, row: 0, w: 2, d: 1, valid: false }}
      />
    );
    expect(container.querySelector('.snap-preview--invalid')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — confirm the new ones FAIL**

```bash
npx vitest run packages/app/src/components/GridPreview.test.tsx 2>&1 | tail -15
```

Expected: new snap preview tests fail.

- [ ] **Step 3: Update GridPreview to accept snapPreview and onSnapChange**

In `GridPreviewProps`, add:
```ts
snapPreview?: { col: number; row: number; w: number; d: number; valid: boolean } | null;
onSnapChange?: (preview: import('../hooks/usePointerDrag').SnapPreviewData | null) => void;
```

Add to destructured props:
```ts
snapPreview = null,
onSnapChange,
```

Update `usePointerDropTarget` call to pass `onSnapChange`:
```ts
usePointerDropTarget({
  gridRef,
  gridX,
  gridY,
  onDrop,
  onSnapChange,
});
```

Add the import at the top:
```ts
import { SnapPreviewOverlay } from './SnapPreviewOverlay';
import type { SnapPreviewData } from '../hooks/usePointerDrag';
```

Inside the `.grid-container` div, after `{cells}` and before `{placedItems.map(...)}`, add:
```tsx
{snapPreview && (
  <SnapPreviewOverlay
    col={snapPreview.col}
    row={snapPreview.row}
    w={snapPreview.w}
    d={snapPreview.d}
    valid={snapPreview.valid}
    gridX={gridX}
    gridY={gridY}
  />
)}
```

- [ ] **Step 4: Run GridPreview tests — all pass**

```bash
npx vitest run packages/app/src/components/GridPreview.test.tsx 2>&1 | tail -15
```

Expected: all tests pass including new snap preview tests.

- [ ] **Step 5: Commit**

```bash
git add packages/app/src/components/GridPreview.tsx \
        packages/app/src/components/GridPreview.test.tsx
git commit -m "feat(grid): render SnapPreviewOverlay when snapPreview prop is set"
```

---

## Task 9: Snap Preview — wire WorkspacePage + CSS

**Files:**
- Modify: `packages/app/src/pages/WorkspacePage.tsx`
- Modify: `packages/app/src/index.css`

- [ ] **Step 1: Add snap state and computed snapPreview to WorkspacePage**

Add imports:
```ts
import { useState, useCallback, useMemo } from 'react'; // useMemo may already be imported
import { hasCollision, isOutOfBounds } from '../hooks/useGridItems';
import type { SnapPreviewData } from '../hooks/usePointerDrag';
```

After the existing `handleCombinedDrop` callback, add:

```ts
const [rawSnapPreview, setRawSnapPreview] = useState<SnapPreviewData | null>(null);

const snapPreview = useMemo(() => {
  if (!rawSnapPreview) return null;
  const { dragData, col, row } = rawSnapPreview;
  if (dragData.type === 'ref-image') return null;

  let w: number, d: number, excludeId: string | undefined;

  if (dragData.type === 'library') {
    const item = getItemById(dragData.itemId);
    if (!item) return null;
    w = item.widthUnits;
    d = item.heightUnits;
  } else if (dragData.type === 'placed' && dragData.instanceId) {
    const placed = placedItems.find(i => i.instanceId === dragData.instanceId);
    if (!placed) return null;
    w = placed.width;
    d = placed.height;
    excludeId = dragData.instanceId;
  } else {
    return null;
  }

  const oob = isOutOfBounds(col, row, w, d, gridResult.gridX, gridResult.gridY);
  const collides = !oob && hasCollision(placedItems, col, row, w, d, excludeId);
  return { col, row, w, d, valid: !oob && !collides };
}, [rawSnapPreview, placedItems, getItemById, gridResult.gridX, gridResult.gridY]);
```

- [ ] **Step 2: Pass snapPreview and onSnapChange to GridPreview**

In the `<GridPreview ... />` JSX, add the two new props:
```tsx
snapPreview={snapPreview}
onSnapChange={setRawSnapPreview}
```

- [ ] **Step 3: Add CSS for snap preview**

In `packages/app/src/index.css`, add:

```css
.snap-preview--valid {
  background: rgba(59, 130, 246, 0.2);
  border: 2px dashed #3b82f6;
  border-radius: 2px;
  box-sizing: border-box;
}

.snap-preview--invalid {
  background: rgba(239, 68, 68, 0.2);
  border: 2px dashed #ef4444;
  border-radius: 2px;
  box-sizing: border-box;
}
```

- [ ] **Step 4: Run full unit suite**

```bash
npm run test:run 2>&1 | tail -10
```

Expected: all 1150 app + 220 server tests pass.

- [ ] **Step 5: Run linter**

```bash
npm run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/app/src/pages/WorkspacePage.tsx \
        packages/app/src/index.css
git commit -m "feat(grid): wire snap preview into WorkspacePage with validity check"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run test:run && npm run test:e2e 2>&1 | tail -20
```

Expected: all 1150 app + 220 server unit tests pass, all 142 E2E tests pass.

- [ ] **Step 2: Done — ready for PR**
