# Water Visual Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the water-level popup visual as a first-class embedded panel in the dashboard.

**Architecture:** Keep `server.js` as the source adapter and add a small water visual data shape derived from the resolved water row. Render the full water-level diagram client-side in `public/app.js` so the user sees the image-like panel instead of only table fields.

**Tech Stack:** Node.js built-in HTTP server, native `node:test`, static HTML/CSS/JS.

## Global Constraints

- Shell commands are prefixed with `rtk`.
- No new runtime dependencies.
- If the source does not provide alert or bank heights, do not invent those values.

---

### Task 1: Water Visual Data Shape

**Files:**
- Modify: `server.js`
- Test: `tests/server.test.js`

**Interfaces:**
- Consumes: parsed water row `{ station, stream, waterLevel, leftBankHeight, rightBankHeight }`
- Produces: `buildWaterVisual(row)` returning display labels plus numeric meter fields

- [x] Write failing tests for `parseWaterRows` and `buildWaterVisual`.
- [x] Export server helpers without starting the HTTP listener during tests.
- [x] Add `buildWaterVisual(row)` and include it in `/api/water` responses as `visual`.
- [x] Run `rtk npm test`.

### Task 2: Frontend Embedded Water Image

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

**Interfaces:**
- Consumes: `water.visual`
- Produces: visible water-level diagram panel under the water card

- [x] Add a water visual section to the page.
- [x] Render an SVG channel diagram from `water.visual`.
- [x] Add responsive styles for the panel.
- [x] Verify in browser at desktop and mobile widths.

### Task 3: Documentation and Handoff

**Files:**
- Modify: `README.md`
- Modify: `WORKLOG.md`

- [x] Document that the water view now includes an embedded diagram.
- [x] Record the key project progress entry.
- [x] Run final tests and browser QA.
