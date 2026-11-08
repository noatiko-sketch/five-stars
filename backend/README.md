# Shared Google storage

Live votes, seen progress and statistics use an owner-deployed Google Apps Script Web App. The existing spreadsheet remains private. The frontend receives only the operations provided by `fiveStarsApi` through an HTML bridge.

The public API endpoint is in `config/storage.json`; no private spreadsheet ID or editor URL is stored in the frontend. `backend/Code.gs` is a template. Its empty `FS_PEOPLE` and `FS_SONGS` arrays must be populated in the owner-controlled deployed script from `data/catalog.json`, preserving catalog order. Never deploy the empty public template over the live script. Set the spreadsheet ID privately in that owner-controlled script.

Run `setupFiveStars` once to create the choices table. Do not reorder participant rows or song indexes without migration. Execute the Web App as its owner, with access for Anyone so participants do not need Google accounts. The spreadsheet itself must remain private. The app uses trust-based name selection, with no verified login or secure admin roles.

The live Pages export injects the shared endpoint into the voting and statistics pages. `/test/` and `/test/stats/` remain isolated device-local experiments and never receive the production endpoint.

Each participant has one compact row. Mutations enforce self-vote rejection, up to ten likes and three loves under a script lock. Loves retain stored value 3 for compatibility and score two points in statistics. Likes score one. When the shared ballot is empty, a valid existing device-local ballot can be imported once; imports never overwrite an existing shared ballot. Shared statistics refresh every twenty seconds and when the tab becomes visible.

Apps Script has execution quotas. Keep seen updates batched, handle transport failures visibly, and do not replace failed shared saves with a device-local success message. The bridge uses a random channel, validates message source and exact origin, and avoids cross-origin fetch redirect assumptions.

Verified 2026-11-08: owner authorization and deployment, live vote write read back from Sheets, reload in a separate browser session, and voter details in the shared statistics view. Mocked Apps Script tests also cover both vote caps, self-voting rejection, import idempotency and weighted scores. Mobile and real browser tests complement those deterministic checks; they do not remove Google service quotas.
