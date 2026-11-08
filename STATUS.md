# Project status

GitHub repository https://github.com/noatiko-sketch/five-stars is public, as requested for free GitHub Pages. The Pages source is GitHub Actions. The deployment workflow runs server regression tests and exports a static preview using `node scripts/export-pages.mjs`.

The public preview intentionally disables voting and statistics until a shared database is connected. It displays a short Hebrew preview notice. Name selection and viewed-card progress exist only in memory during that visit. Reloading resets the preview session. Do not collect real participant votes through this preview.

The full Node.js/SQLite implementation remains available for backend migration. Backend tests cover self-vote rejection, three top choices under concurrent requests, persistence, score updates and aggregate visibility gating. Production database integration is still pending. Supabase connector discovery returned Unknown tool in this conversation.

Catalog contains 1,219 titled entries after six exact normalized title/artist merges and omission of two unresolved entries. All sharing records of included entries are retained. Participants list contains 72 identified link senders. Google Sheet is a source snapshot, and automatic Sheet-to-catalog synchronization remains pending.

Next steps are verify the deployed preview in a browser, address observed UX issues, choose/connect the database, enforce vote constraints and results access on that backend, then enable real voting only after end-to-end persistence tests.


2026-11-08: Added sticky top-three counter, selected-state vote controls, requested hero copy and isolated /test/ environment. GitHub Pages voting now persists locally on this device only, with separate live-local/sandbox namespaces. No shared production database is connected. Test results can be viewed without completion by any test visitor; this is a test bypass, not authenticated production admin access. Test name reviews (remove/rename/reason) persist locally and export JSON. Real admin roles and cross-device votes remain pending a shared backend.

Latest steering: hide all statistics and prioritize shared storage. Added Apps Script backend in backend/Code.gs, stored in bound project the owner’s private bound Apps Script project. OAuth approval and Web App deployment are pending. Production voting stays disabled without FIVE_STARS_STORAGE_URL; test votes remain isolated on device. Revised sharing image 1200x630 at share-cover-v2.jpg avoids reuse of previous cached URL. Do not claim database connection before actual write/readback from another browser session.

2026-11-08: Enable device-local interactive voting on the main Pages URL as well as /test/, clearly labeled as not synchronized. Shared Google storage authorization/deployment still pending. Add sticky separate counters and limits: like=10, love=3, enforced in UI, local store, Node backend and public Apps Script template. Keep existing votes, including legacy counts above ten, removable; never silently truncate.

2026-11-08 statistics page: Removed bottom voting navigation and selected-state check glyph. Separate /stats/ and /test/stats/ pages provide point/love/unique-voter ranking, sender filtering, artwork and per-song voter dialogs. Love ballot remains stored as value 3 for backwards compatibility, but scores now award 2 points for it, 1 for like. Counts and limits unchanged. Statistics explicitly describe browser-local ballots, refresh on storage events and tab focus, and include unvoted tracks when filtering a sender. These are public browser-local views, not a verified shared/admin dashboard.

2026-11-08 shared storage deployed: Main voting and statistics pages now use the configured Apps Script Web App and the private Google Sheet. Separate-browser vote reload and direct Sheet readback succeeded. Sandbox stays device-local. No private management URLs are published. Server template omits the embedded participant dataset; the owner-controlled deployment retains it. Final checks cover love scoring and cancellation, and test ballots are removed after validation.
