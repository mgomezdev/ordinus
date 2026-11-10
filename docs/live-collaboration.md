# Live collaboration contract

Owner authentication covers `/api/v1/layouts/:layoutId/live/*`. An explicitly
editable invitation covers `/api/v1/guest/:linkId/live/*` and exactly its bound
configuration. Guest joins use an opaque HttpOnly cookie; neither a client role
field nor a submitted layout ID establishes authority. Every write rechecks the
credential, expiry and closure in the serialized transaction. Non-browser
mutations without an Origin need `X-Ordinus-Request: 1`.

## Endpoints

- `GET .../snapshot`: authoritative revision, scoped drawer, stable bin identities,
  supported settings, approved catalog, and advisory presence.
- `GET .../events`: SSE change notifications, ready/closure events and 15-second
  heartbeats. Reconnect fetches a fresh snapshot. Heartbeat-triggered reads
  acknowledge presence; abandoned connections age out after 45 seconds.
- `POST .../commands`: strict `{commandId, baseRevision, change}` envelope. Changes
  are `add`, `move`, `rotate`, `remove`, `duplicate`, `batch`, `customize`, or `drawer`. Coordinates use
  integer half-cells; drawer dimensions use millimeters. Guests cannot submit
  global model identifiers, customer/name changes, uploads or production actions.
  A batch contains 1–200 move/rotate/remove/duplicate operations; nested batches
  are rejected. The entire selection commits at one revision or rolls back.
  Duplicate copies only a bin already in this drawer, including frozen source
  and customization, and assigns a fresh stable ID.
- `DELETE /layouts/:layoutId/live/access`: owner-only closure of all editable
  invitations for that drawer. Individual invitation revocation still uses
  `/layouts/:layoutId/guest-links/:linkId`.

Creating an editable invitation snapshots up to 200 active entries from the
chosen library. Public entries expose an opaque catalog key, name and footprint;
private source metadata is retained server-side. Existing and added bins retain
frozen source definitions for their image resolution. Advanced-only custom-bin
settings survive supported edits. Reference image and bin preview fetches each
authorize their placement against the chosen drawer. No global asset path is
returned. Owner assets use the authenticated live route; guest assets use their
invitation's route.

## Ordering and recovery

Migration 013 preserves existing configuration data and leaves existing links
read-only. It adds durable revisions, stable UUIDs for placed bins, frozen model
sources, command receipts and an initial pre-live backup. Legacy whole-cell
geometry is converted to half-cells when live access first starts.

A single local writer queue prevents awaits from interleaving layout writes.
Live transactions additionally use a separate SQLite connection, `BEGIN
IMMEDIATE`, foreign keys, a busy timeout and WAL. Ordinary owner saves participate
in the writer queue; their revision precondition remains required once a layout
has been shared for editing. Missing/stale revisions return 409. Geometry and
permission failures roll back the whole change. Notifications follow commit.
Overlaps and overflow are editing validity states, matching the regular workspace,
and do not reject a structurally valid command. Both views flag affected bins.
Coordinates/dimensions remain bounded integer half-cells and the 200-bin limit
still applies. Snap-step metadata exposes only half/whole pitch support, retaining
private source parameters on the server. The client shares workspace pointer,
snapping, collision, context-menu and viewport primitives; drag metadata is
captured at pointer-down so a remote edit before the drag threshold yields a
revision conflict instead of overwriting it.

Command UUIDs are bound to the actor and canonical envelope. Retrying a committed
command returns its receipt; reusing an ID for a different actor or payload
returns 409. Recent receipts retain 1,000 revisions. A very old retry without a
receipt still has a stale base revision and cannot silently apply again.
Credentials, revisions and receipts persist through restart. An ambiguous
transport/HTTP 5xx result retains the command ID for an explicit retry.

Conflicts never silently replay a stale form or drag. Form values remain local
for review; drag commits use the revision from pointer-down. Editing is disabled
while disconnected. Event streams reconnect and reauthorize before editing
resumes. Presence is advisory, and does not establish identity or permission.
Owner sign-out/reset/expiry ends owner streams; guest leave/closure/expiry ends
the corresponding guest streams. Saved changes remain after closure.

The supported deployment is one Node API process. Multiple API instances would
need coordinated notifications and presence; SQLite durability alone does not
provide that fan-out. Concordia is independently maintained and its harness
adaptation is tracked in BIZ-374.
