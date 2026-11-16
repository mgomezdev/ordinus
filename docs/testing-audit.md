# Use-case and collaboration test audit

Audited 2026-11-14–15. Scope: the documented planning, sharing and printing workflows,
the recent collaboration implementation, and the gates in `.github/workflows/ci.yml`.
Coverage percentages measure executed code, not proof of every possible workflow.

## Use cases and automated checks

Paths below are relative to `app/src`, `server`, or `app/e2e/tests` as indicated.

| Use case | Unit / API evidence | Browser evidence | CI gate |
| --- | --- | --- | --- |
| Admin sign-in, sign-out and recovery | `server/tests/auth.test.ts`, `authPersistence.test.ts`; `components/AdminAuth.test.tsx` | `admin-auth.spec.ts`, `admin-reset.spec.ts` (isolated restart) | test-app, test-server, e2e |
| Arrange, rotate, copy, duplicate and select bins; warn on overlap/overflow | `hooks/useGridItems*.test.ts`, snapping and placement tests | `drag-and-drop.spec.ts`, `collision-detection.spec.ts`, `item-manipulation.spec.ts`, `multi-select.spec.ts`, `copy-paste.spec.ts` | test-app, e2e |
| Physical dimensions, half pitch, units, zoom, pan and phone layouts | dimension, grid transform, custom-bin and curated-library tests | `unit-toggle.spec.ts`, `zoom-pan.spec.ts`, `pan-gestures.spec.ts`, `mobile-layout.spec.ts`, `simple-layout.spec.ts` | test-app, test-server, e2e |
| Save, reload, rename, clone; customers and favorites | layout/customer/favorite services, controllers and hooks | `saved-configs.spec.ts`, `customers.spec.ts`, `favorites.spec.ts` | test-app, test-server, e2e |
| Attach, align, persist and clean up reference photos | ref-image/warp API and hook tests | `reference-images.spec.ts`, `ref-image-alignment.spec.ts` | test-app, test-server, e2e |
| Custom bins and uploaded STL previews | custom-spec validation, generation pipeline, upload/processing tests | `custom-bin.spec.ts`, `user-stl-upload.spec.ts`; real Python rendering in `user-stl-processing.spec.ts` | test-app, test-server, test-python, e2e, e2e-container |
| BOM, PDF output and printing integration | BOM/generation/Themis services, PDF utilities and components | `order-summary.spec.ts`, `export-pdf.spec.ts`, mocked `bom-integrations.spec.ts`; Concordia push contract | test-app, test-server, e2e, e2e-push |
| Read-only invitations and placement-scoped images | `server/tests/guestPreview.test.ts`, `guestModels.test.ts`; guest page tests | `guest-preview.spec.ts` | test-app, test-server, e2e, e2e-container |
| Editable invitations, approved libraries, save-before-share, failure and revocation | `components/layouts/GuestLinkPanel.test.tsx`, `WorkspaceShare.test.tsx`; `server/tests/live.test.ts` | `live-collaboration.spec.ts` | test-app, test-server, e2e, e2e-container |
| Host autosave, remote updates, pending drafts, conflicts and offline recovery | `hooks/useWorkspaceLiveSync.test.tsx`, workspace context tests | host/client race, two-library workspace, offline phone scenarios in `live-collaboration.spec.ts` | test-app, e2e, e2e-container |
| Live commands, stale revisions, atomic selection and idempotent retry | `hooks/useLiveLayout.test.tsx`, live editor/canvas tests; `server/tests/live.test.ts` | two browsers, drag/selection parity, lost acknowledgement and revocation | test-app, test-server, e2e, e2e-container |
| Migration, durable identities, frozen model sources and restart recovery | `server/tests/liveMigration.test.ts`, `livePersistence.test.ts` (real file DB, WAL, separate connections, module/connection restart) | persistent SQLite through nginx in container collaboration tests | test-server, e2e-container |

## Findings corrected

1. **Production model source freezing:** owner saves queried newly written bins
   through the asset connection before the transaction committed. Real SQLite
   connections therefore saw the old drawer, leaving added/replaced sources
   unfrozen. Source capture now reads on the writing connection. The regression
   fails on the old implementation and verifies later library changes cannot
   replace those captured sources. Existing in-memory tests could not expose this.
2. **Recovery after an accepted command:** a failed snapshot refresh left editing
   enabled against cached state. Editing now pauses until an authorized refresh
   succeeds; the accepted command is not treated as ambiguous or replayed.
3. **Command serialization:** two calls before React rendered the saving state
   sent two commands. A synchronous in-flight guard now permits only one.
4. **CI blind spots:** Playwright tests were transpiled without type checking;
   several imports and API fixtures had drifted. CI now type-checks that suite.
   The new required `e2e-container` job consumes the PR's built image and tests
   nginx/SSE, persistent SQLite, guest images and actual STL rendering. Docker
   CI also forbids focused tests, and rendering tests have time to finish their
   existing 90-second readiness poll.
5. **Timing flake:** generation pipeline tests used fixed 50/500 ms sleeps. They
   now await completion/failure events, including before reading the error file.
6. **Stale read-only copy:** read-only previews now explain how to request an
   editable invitation instead of saying collaboration does not exist yet.
7. **First-sharing activation race:** the initial full browser run exposed a
   false conflict after manually saving an unshared drawer. Those saves expose
   no revision, so the hook kept its older baseline. It now adopts the clean
   manually saved content before live activation. Regression tests distinguish
   saved content from unsaved drafts, which still require conflict review.

Additional coverage verifies invitation failure/retry paths, the 200-bin limit
with complete batch rollback and no failed receipt, guarded metadata changes,
independent clones, and retry receipts/guest authority surviving connection and
service restarts. Coverage floors are raised and critical sharing/sync modules
have their own thresholds so unrelated coverage cannot hide regressions there.

## Verified results

| Check | Result |
| --- | --- |
| Frontend unit/component coverage | 97 files, 1,417 tests passed; statements 77.98%, branches 72.03%, functions 72.67%, lines 81.28% |
| Server/shared unit/API coverage | 54 files, 479 tests passed; statements 79.02%, branches 68.99%, functions 79.09%, lines 80.31% |
| Python library-builder tests | 18 passed |
| Full dev browser suite | 194 passed immediately, one passed on retry, three expected integration skips; the retry exposed the activation race described above |
| Collaboration after the activation fix | All five scenarios repeated three times: 15 passed with retries disabled |
| Final packaged image through nginx | 12 passed with retries disabled: five guest-preview, five collaboration, two actual STL-processing tests |
| Static/build gates | Lint, app/server/Playwright type checks, production build, Docker build and actionlint passed |

The final frontend coverage run used four workers after an overloaded all-core
local run exceeded an existing five-second component-test timeout. No timeout or
coverage threshold was relaxed. All raised global and module-specific coverage
thresholds passed. Thirteen tests were added in total.

The container run used a newly provisioned administrator and disposable volumes;
the container, volumes and generated credentials were removed afterward. The
existing remote Concordia `e2e-push` workflow was inspected but was not executed
locally. The first PR run exposed an outdated Concordia harness that attempted
anonymous settings mutations and failed with HTTP 403. The reusable workflow and
its test checkout are now pinned together to Concordia `b455ebe`, which provisions
a disposable administrator and authenticates the integration client. Production
was not changed during validation.

## Execution boundaries

- The dev browser suite deliberately skips two real STL-processing tests and the
  optional live Themis/Laminus health test. The new container gate covers both STL
  tests; the existing Concordia `e2e-push` gate owns the cross-service contract.
- Chromium desktop/phone viewports and synthetic touch gestures are covered.
  Native iOS/Safari, Firefox and physical touch devices remain manual checks.
- Collaboration supports one Node API process. Multiple processes need shared
  notification/presence infrastructure; the tests do not claim that deployment
  is supported. See [the collaboration contract](live-collaboration.md).
- The restart regression recreates service modules and all production database
  connections. It is not a power-loss/fault-injection test.
