# Themis Integration

Ordinus is the upstream design tool; Themis is the downstream print-farm/production manager. "Send to Themis" pushes a generated BOM's STLs into a Themis project. Design spec: `../../concordia/docs/superpowers/specs/2026-07-07-ordinus-themis-integration-design.md` (approved 2026-07-07) — the implementation below has evolved past that spec in two ways noted explicitly.

## Flow (`controllers/themis.controller.ts::sendToThemisHandler`, `POST /api/v1/bom/:layoutId/send-to-themis`)

1. Resolve `THEMIS_URL` from settings (DB) falling back to `config.THEMIS_URL` (env); 503 if neither is set.
2. Load the layout and its `bomGenerations` row; 409 if generation status isn't `ready`.
3. **Resume-or-create**: if `bomGenerations.themisProjectId` is already set, `GET` that project from Themis and read its existing `items`/`links` to compute what's already been sent. A `ThemisTimeoutError` here is re-thrown (ambiguous — don't assume the project is gone); any other failure (e.g. 404, project deleted) falls back to creating a new project.
4. Upload each unique STL filename in the manifest to `{THEMIS_URL}/api/v1/files/upload`. Themis dedups by content-hash **within the target folder**, so re-uploading an already-known file is a cheap no-op there, not a real duplicate write.
5. If no existing project, create one (`source_app: 'ordinus'`, `source_layout_id`, customer name if the layout has one) and persist `themisProjectId` to `bomGenerations` **immediately** — before adding items/links — so a later failure in this same call resumes cleanly on retry instead of orphaning the project.
6. Add project items for manifest entries not already present (by `file_id`, from step 3's set).
7. Add an "Ordinus layout" backlink (`{PUBLIC_URL}/layouts/:layoutId`) if not already present.
8. Return `{ projectUrl, needsFilamentProfiles: manifest.length > 0 }` — Ordinus never assigns filament, so any non-empty send always needs them set in Themis before print generation.

## Where this has drifted from the design spec

- **Folder is flat, not per-layout.** Spec said `/Gridfinity/{layout-slug}` per layout, "so re-running is idempotent per layout." Actual code uses a single fixed `/Gridfinity` folder for **all** Ordinus layouts (`themis.controller.ts` line ~44), with the comment: this is deliberate so the *same bin model reused across different layouts* dedups against each other too, not just within one layout's re-sends. This is a wider dedup scope than the spec described — verify against Themis's actual folder-scoped dedup query if debugging a cross-layout dedup question.
- **Resend resumes the same project, not idempotent-but-new.** Spec's invariant table said "new Themis project created each time but files reused." Actual code instead resumes the existing `themisProjectId` via `getThemisProject` and only creates a new project if none is recorded or the recorded one 404s. This is the behavior concordia's e2e suite verified ("send-to-themis dedup (resend + shared-bin-model reuse)") — treat the code as current source of truth over the spec's resend description.

## Client (`services/themis.service.ts`)

Plain `fetch` wrapper, two timeouts: `REQUEST_TIMEOUT_MS` (30s, JSON calls) vs `UPLOAD_TIMEOUT_MS` (120s, file upload). `ThemisTimeoutError` is a distinct type specifically so callers can tell "Themis took too long" apart from "Themis rejected the request" or a network-level failure — preserve that distinction if you add new Themis calls; don't collapse it into a generic catch.

## Out of scope (per spec, still true)

No filament pre-assignment from Ordinus: items are added with an undefined (deferred) filament ask and the operator picks filament in Themis. No progress streaming during send.

## Themis API contract (companion-app API, `themis/docs/companion-apps.md`)

- **Auth**: `X-Api-Key` header from the `themis_api_key` setting. Key needs scopes `projects:write`, `projects:read`, `files:write`.
- **Project create** sends `external_ref: layout-{id}` with `source_app: 'ordinus'`; `(source_app, external_ref)` is unique in Themis, so a retried create returns the existing project (200) instead of a duplicate.
- **Items** send only `file_id` + `quantity`. The legacy `filament_profile_uuid` / `color_hex` fields were removed from Themis (filament is now the `filament_manufacturer/type/subtype/color` ask tuple; all undefined = deferred).

## Laminus integration (STL → 3MF)

Ordinus still generates/copies STLs itself (`generate_bin.py`); combining them into the layout's single multi-plate 3MF is done by Laminus (`services/laminus.service.ts::buildThreeMfViaLaminus`, called from `runGenerationPipeline`). The old `generator/bundle_3mf.py` was removed.

Single call: `POST /api/v1/pack` with each **unique** STL once plus `items='[{"file","quantity"}]'` and an explicit bed (255×255×250 mm) → final multi-plate 3MF. Limits: 50 unique STLs, 500 total copies (both checked client-side → `LaminusError`). **Requires Laminus >= 0.11.0** (BIZ-337); older versions ignore `items` and produce one copy each.

URL comes from the `laminus_url` setting (no env fallback); generation fails with a clear error if unset. Laminus calls time out at 150s (Laminus' own limit is 120s).
