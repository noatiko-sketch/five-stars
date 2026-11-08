# Five Stars environments

- Production is branch `main`, deployed at the Pages root. Its Apps Script deployment and votes are production data.
- Experiments and ordinary product changes go to branch `staging`, deployed under `/test/`. Do not promote them to `main` until Noa explicitly asks to transfer those changes.
- Both branches build on every deployment: production always comes from `main`, test always comes from `staging`. Shared publishing infrastructure changes may update both branches when necessary to keep this separation working.
- Test exports must use `FIVE_STARS_ENV=test` and `config/storage.json:testUrl`. Never point a test export at `url`, the production endpoint.
- Production and test Apps Script deployments are pinned to different versions and write to different worksheet tabs. A request to reset tests never authorizes resetting production data.
- Promote code only; do not copy test votes, progress or local storage into production. Review environment configuration separately during promotion.
- Public server templates omit private spreadsheet/editor identifiers and embedded participant datasets. Owner-controlled deployed scripts are populated privately from the catalog with stable participant and song IDs.
- Backend changes are deployed and verified against the test deployment first. Editing the script source does not update either pinned deployment by itself. Never update the production deployment version during an experiment.
