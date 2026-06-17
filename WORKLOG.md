# Work Log

## 2026-06-18

- User chose to embed the full water-level visual instead of extracting popup values into separate fields.
- Planned a small change: server returns a water visual data shape; frontend renders it as an embedded water-level diagram while preserving existing water summary fields.
- Added native Node tests for the water row parser and visual data helper, then implemented the server export/data shape and frontend SVG water-level panel.
- Verified with `rtk npm test` and Browser QA at desktop plus 390px mobile width. Live source currently resolves to `觀新橋`, so the UI keeps the existing fallback note.
