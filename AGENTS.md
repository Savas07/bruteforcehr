# Working rules for agents on BruteForceHR

These rules exist because days were lost to agents waiting on shared machine resources. Follow them on every task.

## Shared machine resources

- **iOS simulator:** this Mac has one simulator pool, shared through `/tmp/bfhr-ios-capture.lock` (`apps/ios/scripts/with-ios-lock.sh`). Only one worker uses it at a time.
  - Run XCUITest suites (accessibility audits, UI tests, performance tests) locally, one suite at a time, holding the lock only for that run.
  - The CI `ui-audits` job in `.github/workflows/ios.yml` is a manual cross-check only: on the runner VMs a shard takes 1.5–2 h and audits time out, so it can't gate PRs (`docs/design/foundation-ios.md` "Audits on CI").
  - If the lock is held, do other work. Never sit queued behind it.
  - Build in the shared DerivedData: `BFHR_DERIVED_DATA=$HOME/Library/Developer/Xcode/DerivedData/BFHR-shared`.
- **Rust:** one local Rust build at a time, machine-wide. Delete `apps/desktop/src-tauri/target` afterwards. Prefer CI (`desktop.yml`) for desktop builds and E2E.
- **Disk:** about 8–12 GB is free. Delete your own build outputs when you're done, and check `df -h /` before anything over 3 GB.

## Concurrency and scope

- No sub-agents: the owner decided one worker does everything, in order (2026-10-25).
- Don't base your branch on another agent's unmerged branch. Ask for a published contract commit, or wait for the merge.
- Use the decision numbers (`docs/design/decisions.md`) and file ownership you were assigned; check the latest number before adding one.

## Progress

- Commit early, push your branch, and open a draft PR so CI runs while you continue.
- Report CI run ids. "Done" means green CI plus the acceptance criteria, not a compiling scaffold.

## Checks and builds

GitHub Actions runs again (owner, 2026-10-25). It was off for a few hours that day, after the then-private repo used up its free minutes. The repo is public under the proprietary `LICENSE`, so standard runners are free.

- Before merging, also run locally: `pnpm turbo run lint typecheck test --concurrency=4`, `swift test` in `packages/swift/BFHRUI` and `packages/swift/BFHRCore` (then `rm -rf .build`).
- Releases go through `release.yml` (version PR → tag), as in `docs/runbooks/release.md`.
