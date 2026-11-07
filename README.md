# חמישה כוכבים

Node.js 24 application with SQLite persistence. Run `npm start`, then open port 4173. Run `npm test` for backend regression tests. No package installation is required.

Production requires a Node.js host with a durable writable volume at `DATA_DIR`, HTTPS, and one application instance. SQLite WAL transactions enforce three top picks and prevent self-voting. Back up the SQLite database using SQLite's online backup mechanism. GitHub stores source code. GitHub Pages alone cannot run this backend.

The selected-name identity model is based on trust. Anyone can choose a listed participant's name and act as that participant. A random HttpOnly session cookie binds subsequent requests to that choice. The server enforces vote limits, blocks self-voting (including all co-sharers), and withholds aggregate results and voters until that participant has viewed every included song. Votes and viewed songs are shared across sessions that select the same participant.

Data came from the provided WhatsApp export. Catalog contains only verified titled entries. Exact normalized title-and-artist matches are consolidated, with every sharing record retained. Distinct versions and ambiguous artist matches remain separate. Unresolved entries stay in the source Google Sheet for later review. Artwork URLs reference source services and may require refreshing. No audio files are hosted.

The UI displays no per-song dates or other users' votes outside statistics. Monthly filtering matches individual sharing records. View progress is recorded when 60% of each card enters the viewport, including cards visible through filters. Scrolling through one's own songs also counts toward progress. The server verifies the submitted song IDs and unlock state, but viewport claims are based on client reporting.

## Free GitHub Pages preview

The `Publish GitHub Pages` workflow runs `npm test`, exports the static catalog UI, and deploys `dist`. This preview explicitly disables votes and statistics while the shared database integration is pending. Identity and viewed-card progress are held only in memory for that visit. No backend secrets or raw chat export are published. The source repository and song-sharing catalog are public by user request.
