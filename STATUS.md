# Project status

GitHub repository https://github.com/noatiko-sketch/five-stars is public, as requested for free GitHub Pages. The Pages source is GitHub Actions. The deployment workflow runs server regression tests and exports a static preview using `node scripts/export-pages.mjs`.

The public preview intentionally disables voting and statistics until a shared database is connected. It displays a short Hebrew preview notice. Name selection and viewed-card progress exist only in memory during that visit. Reloading resets the preview session. Do not collect real participant votes through this preview.

The full Node.js/SQLite implementation remains available for backend migration. Backend tests cover self-vote rejection, three top choices under concurrent requests, persistence, score updates and aggregate visibility gating. Production database integration is still pending. Supabase connector discovery returned Unknown tool in this conversation.

Catalog contains 1,219 titled entries after six exact normalized title/artist merges and omission of two unresolved entries. All sharing records of included entries are retained. Participants list contains 72 identified link senders. Google Sheet is a source snapshot, and automatic Sheet-to-catalog synchronization remains pending.

Next steps are verify the deployed preview in a browser, address observed UX issues, choose/connect the database, enforce vote constraints and results access on that backend, then enable real voting only after end-to-end persistence tests.
