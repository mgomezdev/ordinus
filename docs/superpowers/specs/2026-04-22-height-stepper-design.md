# Height Stepper Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the two-input height field in the customization popover with a compact `−` / value / `+` stepper that blends with the existing select-based fields.

**Scope:** `HeightField` component in `BinCustomizationPanel.tsx` and its CSS in `App.css`.

---

## Layout

```
[ − ]  [ 4  ]  [ + ]
         28 mm
```

- Single row: minus button, number input, plus button — all flush, no gaps between them
- `mm` equivalent displayed below in secondary text

## Behaviour

- `−` decrements by 1; disabled when at `min`
- `+` increments by 1; disabled when at `max`
- Center input accepts direct integer keyboard entry
- On blur: parse as integer, clamp to `[min, max]`, discard non-numeric input (revert to current value)
- No decimal input; spinner arrows hidden via CSS

## Styling

Matches the existing `.bin-customization-field select` in the popover:

- Border: `1px solid var(--border-secondary)`, radius `var(--radius-md)`, overflow hidden
- Buttons: background `var(--bg-secondary)`, width `22px`, height `22px`, no border of their own (separated by the shared container border)
- Center input: `flex: 1`, `text-align: center`, `font-size: var(--text-xs)`, no spinner arrows, no outline
- `mm` label: `font-size: 10px`, `color: var(--text-secondary)`, `text-align: right`

## Files

- Modify: `packages/app/src/components/BinCustomizationPanel.tsx` — rewrite `HeightField` render
- Modify: `packages/app/src/App.css` — replace `.height-inputs` with `.height-stepper`, `.height-stepper-btn`, `.height-stepper-input`, `.height-stepper-mm`
