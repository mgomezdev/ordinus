# BOM View Refactor Design

**Date:** 2026-04-19
**Status:** Approved

## Overview

Remove the order promotion/submission system entirely. User logins exist only to isolate saved configs. Convert the Order Summary page to a BOM view page with direct STL generation. Give admins a filtered view of all users' saved configs on the existing Saved Configs page.

---

## Data Model Changes

### Drop layout status

- Remove the `status` column from the `layouts` table.
- Remove the `LayoutStatus` type (`'draft' | 'submitted' | 'delivered'`) from shared types.
- All layouts are always editable. No read-only state based on status.

### Remove bom_submissions

- Drop the `bom_submissions` table entirely.
- Remove `ApiBomSubmission` type from shared types.
- Remove all server code (controller, service, routes) related to BOM submissions.

### Restructure bom_generations

- Replace `submissionId` column with `layoutId` (foreign key → `layouts.id`).
- Add a unique constraint on `layoutId` (one generation record per layout).
- Generation records from before the migration can be dropped — they reference submissions that no longer exist.

### Removed routes

| Method | Route | Reason |
|--------|-------|--------|
| PATCH | `/layouts/:id/submit` | Submission flow removed |
| PATCH | `/layouts/:id/withdraw` | Submission flow removed |
| PATCH | `/layouts/:id/deliver` | Submission flow removed |
| POST | `/bom/submit` | Submissions removed |
| POST | `/admin/bom/:submissionId/generate` | Replaced by user-accessible route |

### New / changed routes

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| POST | `/bom/generate/:layoutId` | Authenticated user (own layout) | Read layout, build BOM, trigger STL generation. Returns generation record. |
| GET | `/bom/generation/:layoutId` | Authenticated user (own layout) | Poll generation status. |
| GET | `/bom/generation/:layoutId/files/:filename` | Authenticated user (own layout) | Download generated file. |
| GET | `/admin/users` | Admin | Return list of `{ id, username }` for the user selector dropdown. |
| GET | `/admin/layouts?userId=X` | Admin | Return layouts for a specific user (same shape as `GET /layouts`). |

---

## BOM View Page

### Rename

- Page title: "Order Summary" → "BOM"
- Nav link updated to match.
- Route path unchanged unless it currently says `/order-summary` — if so, rename to `/bom`.

### Toolbar changes

- Remove the "Submit Layout" button.
- Add a **Generate** button (becomes **Regenerate** once a generation record exists for this layout).
  - Calls `POST /bom/generate/:layoutId`.
  - Shows a spinner while generation status is `generating`.
  - Displays an error message if status is `error`.
- The existing "Download PDF" button stays in place.
- Add **Download 3MF** below Download PDF.
  - Disabled until generation status is `ready`.
  - Calls `GET /bom/generation/:layoutId/files/<filename>` to download the `.3mf`.

### Content unchanged

- As Configured section (BOM items, qty, size, unit price, total)
- Extras section
- Subtotals, grand total, capacity bar
- Pricing columns

### Removed

- `AdminBomPanel` component — deleted entirely. Its generate/download functionality is now the Generate button available to all authenticated users on their own layouts.

---

## Saved Configs Page — Mine / Users Tabs

### Tab structure

- Two tabs: **Mine** and **Users**.
- **Mine tab:** Current behavior — the logged-in user's layouts. No change.
- **Users tab:** Admin-only. Hidden entirely for non-admin users (no tab rendered).

### Users tab behavior

- Contains a searchable user dropdown populated from `GET /admin/users`.
- No user selected → empty state with prompt: "Select a user to view their saved configs."
- Selecting a user calls `GET /admin/layouts?userId=X` and renders their layouts in the same card/list format as the Mine tab.
- All layout actions (open, duplicate, delete) work the same as on Mine. Admins can open any user's layout into the workspace.

### Non-admin users

- See no tabs. Page behaves exactly as today.

---

## Frontend Cleanup

| Item | Action |
|------|--------|
| `AdminBomPanel` component | Delete |
| Submit Layout button | Delete |
| Status badges on layout cards | Delete |
| Read-only checks based on `layout.status` | Delete |
| `submissionId` in `layoutMeta` / `WorkspaceContext` | Delete |
| BOM submission API client methods | Delete |
| `LayoutStatus` type references | Delete |
| `ApiBomSubmission` type references | Delete |

---

## Server Cleanup

| Item | Action |
|------|--------|
| `bom/submit` route + controller | Delete |
| `admin/bom/:id/generate` route + controller | Delete |
| Submit/withdraw/deliver route handlers | Delete |
| `bomSubmissions` Drizzle schema table | Delete |
| `bom_submissions` DB migration | Drop table |
| `layouts.status` DB migration | Drop column |
| `bom_generations.submissionId` | Replace with `layoutId` |

---

## Out of Scope

- No change to authentication or user registration.
- No change to reference images, layout saving, or grid workspace.
- No change to pricing data on library items.
- No new user management UI (admin users list is read-only dropdown only).
