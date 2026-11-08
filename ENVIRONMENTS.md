# Production and test

| Environment | Branch | Voting URL | Statistics URL |
|---|---|---|---|
| Production | main | https://noatiko-sketch.github.io/five-stars/ | https://noatiko-sketch.github.io/five-stars/stats/ |
| Test | staging | https://noatiko-sketch.github.io/five-stars/test/ | https://noatiko-sketch.github.io/five-stars/test/stats/ |

The workflow always checks out main for the root and staging for /test/, regardless of which branch triggers it. Test exports require FIVE_STARS_ENV=test and use only testUrl from the storage configuration. Both builds must pass before publishing.

Apps Script deployments are pinned to independent versions and use different worksheets. The test deployment supports a test-only reset. The production API does not accept reset. Both use the existing Google account; no additional service subscription is required.

Experiments belong on staging. Transfer approved code to main only when Noa explicitly asks. Review the diff and retain environment configuration. Do not copy test votes, progress or local storage into production during promotion.

The test identity has a separate browser key. Existing device-local production ballots are never imported into shared test storage. Name-review notes are drafts and do not rename production participants automatically.

Use the reset button on the test voting page to clear all test ballots and progress. Names, songs and production votes remain intact.

Before changing a backend, populate the owner-controlled test script privately from the stable catalog, check the test worksheet target and deploy a new test version. Source edits do not update pinned production versions. Do not publish private identifiers or embedded participant datasets in server templates.
