# Working rules for agents on BruteForceHR

These rules exist because days were lost to agents waiting on shared machine resources. Follow them on every task.

## Shared machine resources

- **iOS simulator:** this Mac has one simulator pool, shared through `/tmp/bfhr-ios-capture.lock` (`apps/ios/scripts/with-ios-lock.sh`). Only one worker uses it at a time.
  - Run XCUITest suites (accessibility audits, UI tests, performance tests) locally, one suite at a time, holding the lock only for that run.
  - GitHub Actions is off (see "Checks and builds").
  - If the lock is held, do other work. Never sit queued behind it.
  - Build in the shared DerivedData: `BFHR_DERIVED_DATA=$HOME/Library/Developer/Xcode/DerivedData/BFHR-shared`.
- **Rust:** one local Rust build at a time, machine-wide. Delete `apps/desktop/src-tauri/target` afterwards.
- **Disk:** about 8–12 GB is free. Delete your own build outputs when you're done, and check `df -h /` before anything over 3 GB.

## Concurrency and scope

- No sub-agents: the owner decided one worker does everything, in order (2026-10-25).
- Don't base your branch on another agent's unmerged branch. Ask for a published contract commit, or wait for the merge.
- Use the decision numbers (`docs/design/decisions.md`) and file ownership you were assigned; check the latest number before adding one.

## Progress

- Commit early and push your branch.
- "Done" means the local checks below pass plus the acceptance criteria, not a compiling scaffold.

## Checks and builds

The owner turned GitHub Actions off (2026-10-25): every workflow in `.github/workflows` is disabled and nothing runs on push, PR or tag. Builds and releases are made on this Mac, by hand, when the owner asks. The source repo is public again, under the proprietary `LICENSE` (view only), so the same day Actions would be free again; it stays off by the owner's choice.

- Before merging: `pnpm turbo run lint typecheck test --concurrency=4`, `swift test` in `packages/swift/BFHRUI` and `packages/swift/BFHRCore` (then `rm -rf .build`), plus the app build and UI suites the change touches.
- The workflow files stay as the reference for each pipeline step. Re-enable one with `gh workflow enable <file>` only if the owner asks.
