# Shared Google storage

The source catalog is served by GitHub Pages. Choices and seen progress are stored separately in the private existing spreadsheet, tab `בחירות האתר`.

The owner manages the bound script from Extensions → Apps Script in the existing private spreadsheet.

1. Review Google Sheets authorization for the bound script; Google requests Sheets access. Code opens only the configured spreadsheet.
2. Run `setupFiveStars` once to create the choices table. Never remove/reorder rows manually.
3. Deploy as Web App, execute as owner, access Anyone. Keep spreadsheet sharing private. This public API permits choosing a name and modifying its votes by design (trust-based identity); it is not verified authentication.
4. Set `globalThis.FIVE_STARS_STORAGE_URL` to the deployed `/exec` URL in the main exported HTML only; the test environment uses device-local data and must never point to production storage.
5. Test vote creation, cancellation, fourth-love rejection, own-song rejection and persistence from another browser session with the same selected person; verify saved rows in Sheets before opening voting to the group.

Bridge: a hidden Apps Script HTML iframe uses `google.script.run` for requests. Replies use a random channel and the exact GitHub Pages origin. This avoids relying on unsupported cross-origin fetch response headers. No Sheets credentials go into GitHub.

Each participant has one compact row, vote/seen keys use catalog indexes, mutations use a script lock, and the UI applies only monotonic revisions. Catalog index order must remain stable; migrate stored indexes before changing that order. Source song IDs in the backend include co-sharers and merged entries.

Not yet production-verified: OAuth, deployment, iframe message round-trip and concurrent real Sheets saves. The frontend remains disabled until a storage URL is configured. Apps Script has execution quotas; keep seen updates batched and avoid aggressive polling. All current live/shared choices must be treated as trust-based, with no secure admin permissions.
