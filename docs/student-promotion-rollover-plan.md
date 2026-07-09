# Student Promotion & Graduation Rollover — Implementation Plan

## Status
Proposed, not yet implemented. This document captures the design discussion and plan so it can
be picked up when the team is ready to build it (e.g., ahead of the next school year).

## Problem

Each school year: 4th-year students graduate, most continuing students move up a year level, and
a handful of students repeat their current year level. The system currently has no support for
any of this — there is no promotion flow, no graduation state, and no year-level rollover.

## Current state (as of this writing)

- Students are pinned to a `section_id` indefinitely. Nothing ever moves them.
- `sections.year_level` already exists as a database column
  (`bulsu-wifi-backend/routes/admin/settings.js`), but it is **dead** — never exposed in the
  Sections tab UI, and never accepted by the section create/update endpoints. No section
  currently has a meaningful year level set through the app.
- A working (if informal) path already exists: bulk CSV re-import
  (`bulsu-wifi-backend/routes/admin/users.js`) uses `INSERT ... ON DUPLICATE KEY UPDATE` keyed on
  `student_number`, and already updates `course_id`, `section_id`, `school_year`, `semester`, and
  `enrollment_status` on existing students. Re-importing a corrected roster today *does* move
  students between sections — this just isn't framed as a "promotion" feature anywhere.
- `enrollment_status` (`enrolled` / `not_enrolled`) does **not** gate login. Only
  `status = 'blocked'` currently blocks a user from logging into the WiFi portal
  (`bulsu-wifi-backend/routes/authRoutes.js`). There is no `graduated` state today.
- The system has **no visibility into academic standing** (grades, units passed/failed). It is a
  WiFi access system, not the SIS. It can never autonomously determine who is repeating a year —
  that information must always come from an admin/registrar as external input.

## Design decision: why an explicit review step, not a blind bulk move

A naive "promote everyone in BSIT-2A to BSIT-3A" bulk action would silently promote repeating
students along with everyone else, since the system has no way to know who repeated. The design
below always requires an admin to see the full list of affected students and explicitly flag
exceptions before anything is written — the same shape as the existing CSV bulk-import preview
(`bulsu-wifi-frontend/src/components/admin/AdminUsers.jsx`, `csvState` preview table), reused
rather than reinvented.

## Planned UI flow

### 1. New screen: "Promote / Rollover"
Location: either a new tab under Settings, or a dedicated action from the Users page. Not yet
decided — revisit at implementation time.

### 2. Setup step
- Admin picks a **source**: a course + section (or sections) representing the current cohort to
  roll over (e.g., "BSIT 2A").
- Admin picks a **destination**: an explicit target section from a dropdown (e.g., "BSIT 3A").
  The mapping is chosen explicitly by the admin, not inferred from section names — naming
  conventions aren't guaranteed to stay consistent year over year, and an explicit picker avoids
  building fragile matching logic.
- For a 4th-year (terminal) source section, there is no destination section — the action for
  that batch is **Graduate** instead of **Promote**.

### 3. Review table (reuses the CSV-import preview pattern)
One row per currently-enrolled student in the source section, with:
- a checkbox to include/exclude the student from this batch
- a per-row action override: **Promote** (default) / **Retain** (repeats — stays in the current
  section) / **Graduate** (default action instead of Promote when the source is a terminal year)
- search/filter box and a "select all" toolbar for large sections

Nothing is written until the admin explicitly reviews this table. A repeating student is handled
by the admin flipping their row to **Retain** before confirming — this is the actual answer to
the "what about repeaters" problem, and requires no automatic detection.

### 4. Confirm step
- Show a one-line summary before commit, e.g.: *"42 promoted to BSIT-3A, 2 retained in BSIT-2A,
  0 graduated."*
- On confirm, a single batch write:
  - **Promoted** rows: `section_id` updated to the destination section.
  - **Graduated** rows: `status` set to `graduated` (see below).
  - **Retained** rows: no change (they simply aren't touched).

## Prerequisite backend/schema work

1. **Wire up `year_level` for real.**
   - Add a `year_level` field to the Sections tab create/edit form
     (`bulsu-wifi-frontend/src/components/admin/AdminSettings.jsx`).
   - Accept and persist `year_level` in the section create/update endpoints
     (`bulsu-wifi-backend/routes/admin/settings.js`, `POST`/`PUT /catalog/sections`).

2. **Add a real `graduated` status.**
   - Extend the `status` column's meaningful values to include `graduated` (alongside `active`
     and `blocked`) — deliberately using `status`, not `enrollment_status`, since `status` is
     already the column that gates login.
   - Update the login check in `bulsu-wifi-backend/routes/authRoutes.js` — currently
     `if (user.status === "blocked") return res.status(403)...` — to reject anything other than
     `active`, with a status-specific message (e.g., distinguishing "Account graduated." from
     "Account blocked.").

3. **New backend endpoint** for the promote/graduate batch write (source section(s), destination
   section, and a per-student action list from the review table).

## Explicitly out of scope for this pass

- No automatic detection of repeaters — always an admin decision, by design (see above).
- No historical/audit log of past promotions (who was promoted when). Acceptable simplification
  for now; revisit if the panel or real usage calls for an audit trail.
- No automatic section-name matching for the promotion destination — always an explicit picker.

## Open questions to resolve before building

- Where should the "Promote / Rollover" entry point live in the admin nav (Users vs. a new
  Settings tab)?
- Should sections be reusable year-level templates (today's model — "BSIT 2A" always means
  2nd year, reused every cohort) or year-specific instances created fresh each year? The plan
  above assumes the current reusable-template model; a cohort-based model would need a larger
  schema change (a `school_year` on `sections` itself) and is out of scope here.
