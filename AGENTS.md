# Working rules for agents on BruteForceHR

These rules exist because days were lost to agents waiting on shared machine resources. Follow them on every task.

## Shared machine resources
- **iOS simulator:** this Mac has one simulator pool, shared through `/tmp/bfhr-ios-capture.lock` (`apps/ios/scripts/with-ios-lock.sh`).
  - Run XCUITest suites (accessibility audits, UI tests, performance tests) on CI, never locally. New suites go into the matrix of the `ui-audits` job in `.github/workflows/ios.yml`; read the results from the PR run, which uploads the `.xcresult` on failure.
  - Use the local lock only for live checks (`apps/ios/scripts/*-live-check.sh`) and screenshot captures, and hold it briefly.
  - If the lock is held, do other work or use CI. Never sit queued behind it.
  - Build in the shared DerivedData: `BFHR_DERIVED_DATA=$HOME/Library/Developer/Xcode/DerivedData/BFHR-shared`.
- **Rust:** one local Rust build at a time, machine-wide. Ask the integration owner first, and delete `apps/desktop/src-tauri/target` afterwards. Prefer CI (`desktop.yml`) for desktop builds and E2E.
- **Disk:** about 8–12 GB is free. Delete your own build outputs when you're done, and check `df -h /` before anything over 3 GB.

## Concurrency and scope
- Don't spawn sub-agents; the API rate limit hits at around 8 parallel agents.
- Don't base your branch on another agent's unmerged branch. Ask for a published contract commit, or wait for the merge.
- Use the decision numbers (`docs/design/decisions.md`) and file ownership you were assigned; check the latest number before adding one.

## Progress
- Commit early, push your branch, and open a draft PR so CI runs while you continue.
- Report CI run ids. "Done" means green CI plus the acceptance criteria, not a compiling scaffold.
